import { streamText, stepCountIs, type ModelMessage, gateway } from 'ai';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import type { SessionManager } from '../session/manager.js';
import type { TranscriptEntry } from '../session/types.js';
import type { ModelCandidate } from '../config/schema.js';
import {
  ModelSelector,
  CooldownTracker,
  type ModelGroup,
  type ModelSelection,
} from '../ai/model-group.js';
import { streamWithFailover } from '../ai/failover.js';
import { getLanguageModel } from '../ai/provider.js';
import {
  createEscalationState,
  shouldEscalate,
  recordToolCall,
  recordTokenUsage,
  escalate,
  type EscalationState,
} from '../ai/escalation.js';
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
  messages: ModelMessage[];
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
  citationsEnabled?: boolean;
  memoryBackend?: string;
  availableAgents?: Array<{ id: string; name: string; emoji: string; about: string }>;
}

const providerEnvKeys: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
};

function buildGatewayOptions(
  provider: string
): { byok: Record<string, { apiKey: string }[]> } | null {
  const envKey = providerEnvKeys[provider];
  const apiKey = envKey ? process.env[envKey] : undefined;
  if (!apiKey) return null;
  return {
    byok: {
      [provider]: [{ apiKey }],
    },
  };
}

export class AgentRunner {
  constructor(
    private toolRegistry: ToolRegistry,
    private cooldowns: CooldownTracker,
    private sessionManager: SessionManager
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
      citationsEnabled: options.citationsEnabled,
      memoryBackend: options.memoryBackend,
      availableAgents: options.availableAgents,
    };
    const systemPrompt = buildSystemPrompt(promptCtx);

    // Get AI SDK tools filtered by permissions (and agent tool list if defined)
    const aiTools = options.agent.allowedTools
      ? this.toolRegistry.toAiSdkToolsForAgent(options.toolContext, options.agent)
      : this.toolRegistry.toAiSdkTools(options.toolContext);

    // Escalation state
    let escState = createEscalationState();

    // Determine initial model group from agent's modelRef
    let currentGroup: ModelGroup = 'fast';
    if (options.agent.modelRef === 'slow') {
      currentGroup = 'slow';
    }

    // Check if any tool in the conversation requires slow model
    const slowTools = this.toolRegistry.getToolsRequestingGroup('slow');

    // Helper to select model for current group
    const selectModel = (group: ModelGroup): ModelSelection | null => {
      const globalCandidates = options.globalModels[group];
      const workspaceCandidates = options.workspaceModels?.[group];
      return selector.select(group, globalCandidates, workspaceCandidates);
    };

    // Try agent-specific model (provider/model format) before group selection
    let selection: ModelSelection | null = null;
    if (options.agent.modelRef && options.agent.modelRef !== 'fast' && options.agent.modelRef !== 'slow') {
      const parts = options.agent.modelRef.split('/');
      if (parts.length === 2) {
        const [provider, model] = parts;
        const agentModel = getLanguageModel(provider, model);
        if (agentModel && this.cooldowns.isAvailable(provider, model)) {
          selection = { model: agentModel, candidate: { provider, model }, group: currentGroup };
        }
      }
    }

    // Try fallback model if primary didn't resolve
    if (!selection && options.agent.fallbackModelRef) {
      const parts = options.agent.fallbackModelRef.split('/');
      if (parts.length === 2) {
        const [provider, model] = parts;
        const fallbackModel = getLanguageModel(provider, model);
        if (fallbackModel && this.cooldowns.isAvailable(provider, model)) {
          selection = { model: fallbackModel, candidate: { provider, model }, group: currentGroup };
        }
      }
    }

    // Fall through to standard group selection
    if (!selection) {
      selection = selectModel(currentGroup);
    }

    if (!selection) {
      yield {
        type: 'done',
        response: 'No available models for this request.',
        usage: { promptTokens: 0, completionTokens: 0 },
      };
      return;
    }

    let fullResponse = '';
    let lastToolResult = '';
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let currentMessages = [...options.messages];
    let needsEscalationRerun = false;
    let maxRuns = 3; // Prevent infinite loops
    let runCount = 0;

    try {
      while (runCount < maxRuns) {
        runCount++;
        needsEscalationRerun = false;
        let stepHadToolCalls = false;
        const gatewayOpts = buildGatewayOptions(selection.candidate.provider);
        const result = streamText({
          model: selection.model,
          system: systemPrompt,
          messages: currentMessages,
          tools: aiTools,
          stopWhen: stepCountIs(10),
          onStepFinish: async (step) => {
            // Record tool calls for escalation tracking
            if (step.toolCalls && step.toolCalls.length > 0) {
              stepHadToolCalls = true;
              for (const _tc of step.toolCalls) {
                escState = recordToolCall(escState);
              }
            }
            // Record token usage
            if (step.usage) {
              escState = recordTokenUsage(
                escState,
                (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0)
              );
              totalPromptTokens += step.usage.inputTokens ?? 0;
              totalCompletionTokens += step.usage.outputTokens ?? 0;
            }
            // Check if we should escalate after this step
            if (currentGroup === 'fast' && shouldEscalate(escState)) {
              escState = escalate(escState, escState.reason ?? 'Threshold exceeded');
            }
          },
          providerOptions: gatewayOpts ? { gateway: gatewayOpts } : undefined,
        });

        // Collect tool calls and results for potential continuation
        const toolCallsInRun: Array<{ toolName: string; args: unknown; result: unknown }> = [];

        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              fullResponse += part.text;
              yield { type: 'text-delta', content: part.text };
              break;
            case 'tool-call':
              yield { type: 'tool-call', toolName: part.toolName, args: part.input };
              // Check if this tool requests slow model
              if (slowTools.includes(part.toolName) && currentGroup === 'fast') {
                escState = escalate(escState, `Tool ${part.toolName} requests slow model`);
              }
              toolCallsInRun.push({ toolName: part.toolName, args: part.input, result: undefined });
              break;
            case 'tool-result':
              lastToolResult = typeof part.output === 'string' ? part.output : JSON.stringify(part.output);
              yield {
                type: 'tool-result',
                toolName: part.toolName,
                result: lastToolResult,
              };
              // Update the last matching tool call with its result
              const lastCall = [...toolCallsInRun]
                .reverse()
                .find((tc) => tc.toolName === part.toolName && tc.result === undefined);
              if (lastCall) {
                lastCall.result = part.output;
              }
              break;
          }
        }

        // After stream completes, check if we need to escalate and re-run
        if (escState.escalated && currentGroup === 'fast' && stepHadToolCalls) {
          const previousModel = `${selection.candidate.provider}:${selection.candidate.model}`;
          currentGroup = 'slow';
          const newSelection = selectModel(currentGroup);

          if (newSelection) {
            const newModel = `${newSelection.candidate.provider}:${newSelection.candidate.model}`;
            yield {
              type: 'model-switch',
              from: previousModel,
              to: newModel,
              reason: escState.reason ?? 'Escalation triggered',
            };

            selection = newSelection;
            needsEscalationRerun = true;

            // Build continuation messages: original + assistant response + tool results
            // The AI SDK handles this internally, but for a clean restart we append context
            if (fullResponse) {
              currentMessages = [
                ...currentMessages,
                { role: 'assistant' as const, content: fullResponse },
              ];
              fullResponse = ''; // Reset for continuation
            }
          }
        }

        // If no escalation rerun needed, we're done
        if (!needsEscalationRerun) {
          break;
        }
      }

      // If model produced no text but did call tools, use the last tool result as response
      if (!fullResponse && lastToolResult) {
        fullResponse = lastToolResult;
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
            escalated: escState.escalated,
            escalationReason: escState.reason,
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
        const cost = estimateCost(selection.candidate.model, tokens);
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
