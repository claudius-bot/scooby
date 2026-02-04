import { streamText, type CoreMessage, type LanguageModelV1 } from 'ai';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import type { SessionManager } from '../session/manager.js';
import type { TranscriptEntry } from '../session/types.js';
import type { ModelCandidate } from '../config/schema.js';
import { ModelSelector, CooldownTracker, type ModelGroup } from '../ai/model-group.js';
import { streamWithFailover } from '../ai/failover.js';
import { getLanguageModel } from '../ai/provider.js';
import { createEscalationState, shouldEscalate, recordToolCall, recordTokenUsage, escalate, type EscalationState } from '../ai/escalation.js';
import { buildSystemPrompt, type PromptContext } from './prompt-builder.js';
import { loadSkills } from './skills.js';
import type { UsageTracker } from '../usage/tracker.js';
import { estimateCost } from '../usage/pricing.js';

export type AgentStreamEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'tool-call'; toolName: string; args: unknown }
  | { type: 'tool-result'; toolName: string; result: string }
  | { type: 'model-switch'; from: string; to: string; reason: string }
  | { type: 'done'; response: string; usage: { promptTokens: number; completionTokens: number } };

export interface AgentRunOptions {
  messages: CoreMessage[];
  workspaceId: string;
  workspacePath: string;
  agent: import('../workspace/types.js').AgentProfile;
  sessionId: string;
  toolContext: ToolContext;
  globalModels: {
    fast: ModelCandidate[];
    slow: ModelCandidate[];
  };
  workspaceModels?: {
    fast?: ModelCandidate[];
    slow?: ModelCandidate[];
  };
  memoryContext?: string[];
  usageTracker?: UsageTracker;
  agentName?: string;
  channelType?: string;
}

export class AgentRunner {
  constructor(
    private toolRegistry: ToolRegistry,
    private cooldowns: CooldownTracker,
    private sessionManager: SessionManager,
  ) {}

  async *run(options: AgentRunOptions): AsyncGenerator<AgentStreamEvent> {
    const selector = new ModelSelector(this.cooldowns);
    const skills = await loadSkills(options.workspacePath);

    // Build system prompt
    const promptCtx: PromptContext = {
      agent: options.agent,
      skills,
      memoryContext: options.memoryContext ?? [],
      timestamp: new Date(),
      workspaceId: options.workspaceId,
      workspacePath: options.workspacePath,
    };
    const systemPrompt = buildSystemPrompt(promptCtx);

    // Get AI SDK tools filtered by permissions
    const aiTools = this.toolRegistry.toAiSdkTools(options.toolContext);

    // Escalation state
    let escState = createEscalationState();
    let currentGroup: ModelGroup = 'fast';

    // Check if any tool in the conversation requires slow model
    const slowTools = this.toolRegistry.getToolsRequestingGroup('slow');

    // Select initial model
    const globalCandidates = options.globalModels[currentGroup];
    const workspaceCandidates = options.workspaceModels?.[currentGroup];

    let selection = selector.select(currentGroup, globalCandidates, workspaceCandidates);
    if (!selection) {
      yield { type: 'done', response: 'No available models for this request.', usage: { promptTokens: 0, completionTokens: 0 } };
      return;
    }

    let fullResponse = '';
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    // Prepare candidates for failover
    const prepareCandidates = (group: ModelGroup) => {
      const candidates = options.workspaceModels?.[group] ?? options.globalModels[group];
      return candidates.map(c => ({
        model: getLanguageModel(c.provider, c.model),
        candidate: c,
      }));
    };

    try {
      const result = streamText({
        model: selection.model,
        system: systemPrompt,
        messages: options.messages,
        tools: aiTools,
        maxSteps: 10,
        onStepFinish: async (step) => {
          // Record tool calls for escalation tracking
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const _tc of step.toolCalls) {
              escState = recordToolCall(escState);
            }
          }
          // Record token usage
          if (step.usage) {
            escState = recordTokenUsage(escState, step.usage.promptTokens + step.usage.completionTokens);
            totalPromptTokens += step.usage.promptTokens;
            totalCompletionTokens += step.usage.completionTokens;
          }
        },
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullResponse += part.textDelta;
            yield { type: 'text-delta', content: part.textDelta };
            break;
          case 'tool-call':
            yield { type: 'tool-call', toolName: part.toolName, args: part.args };
            // Check if this tool requests slow model
            if (slowTools.includes(part.toolName) && currentGroup === 'fast') {
              escState = escalate(escState, `Tool ${part.toolName} requests slow model`);
            }
            break;
          case 'tool-result':
            yield { type: 'tool-result', toolName: part.toolName, result: typeof part.result === 'string' ? part.result : JSON.stringify(part.result) };
            break;
        }
      }

      // Record final response to transcript
      if (fullResponse) {
        await this.sessionManager.appendTranscript(options.sessionId, {
          timestamp: new Date().toISOString(),
          role: 'assistant',
          content: fullResponse,
          metadata: {
            modelUsed: `${selection.candidate.provider}:${selection.candidate.model}`,
            modelGroup: currentGroup,
            tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
          },
        });
      }

      // Record usage
      if (options.usageTracker) {
        const tokens = {
          input: totalPromptTokens,
          output: totalCompletionTokens,
          total: totalPromptTokens + totalCompletionTokens,
        };
        const cost = estimateCost(
          selection.candidate.provider,
          selection.candidate.model,
          tokens,
        );
        await options.usageTracker.record({
          timestamp: new Date().toISOString(),
          workspaceId: options.workspaceId,
          sessionId: options.sessionId,
          provider: selection.candidate.provider,
          model: selection.candidate.model,
          agentName: options.agentName ?? options.agent.name,
          modelGroup: currentGroup,
          tokens,
          cost,
          channelType: options.channelType,
        });
      }

    } catch (err) {
      fullResponse = `Error during agent execution: ${err instanceof Error ? err.message : String(err)}`;
    }

    yield {
      type: 'done',
      response: fullResponse,
      usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    };
  }
}
