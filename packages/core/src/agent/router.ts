import type { AgentRegistry } from './registry.js';
import type { ModelCandidate, RoutingConfig } from '../config/schema.js';
import { generateWithFailover, type FailoverCandidate } from '../ai/failover.js';
import { CooldownTracker } from '../ai/model-group.js';
import { getLanguageModel } from '../ai/provider.js';

const routerCooldowns = new CooldownTracker();

/**
 * Routes user messages to the most appropriate agent using a cheap/fast LLM.
 */
export class AgentRouter {
  private registry: AgentRegistry;
  private routingConfig?: RoutingConfig;
  private fastCandidates: ModelCandidate[];

  constructor(
    registry: AgentRegistry,
    fastCandidates: ModelCandidate[],
    routingConfig?: RoutingConfig,
  ) {
    this.registry = registry;
    this.routingConfig = routingConfig;
    this.fastCandidates = fastCandidates;
  }

  /**
   * Route a user message to an agent. Returns agentId.
   */
  async route(userMessage: string): Promise<string> {
    const agents = this.registry.listEntries();
    if (agents.length === 0) return this.registry.getDefaultId();
    if (agents.length === 1) return agents[0][0];

    // Build agent descriptions for the router prompt
    const agentList = agents
      .map(([id, a]) => `- ${id}: ${a.about ?? a.name}`)
      .join('\n');

    const systemPrompt = this.routingConfig?.prompt ??
      `You are a message router. Given a user message, select the most appropriate agent to handle it.

Available agents:
${agentList}

Respond with ONLY the agent id (e.g., "scooby"). Nothing else.`;

    // Resolve model candidates
    const candidates = this.resolveCandidates();
    if (candidates.length === 0) {
      return this.registry.getDefaultId();
    }

    try {
      const result = await generateWithFailover({
        candidates,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
        cooldowns: routerCooldowns,
      });

      const agentId = (typeof result.text === 'string' ? result.text : '').trim().toLowerCase();

      // Validate the agent exists
      if (this.registry.has(agentId)) {
        return agentId;
      }

      // Try fuzzy match (e.g., "Velma" -> "velma")
      const match = this.registry.findByName(agentId);
      if (match) return match[0];

      console.warn(`[AgentRouter] Router returned unknown agent "${agentId}", using default`);
      return this.registry.getDefaultId();
    } catch (err) {
      console.error('[AgentRouter] Routing failed, using default agent:', err);
      return this.registry.getDefaultId();
    }
  }

  private resolveCandidates(): FailoverCandidate[] {
    // If routing config specifies a model, parse "provider/model" format
    if (this.routingConfig?.model) {
      const parts = this.routingConfig.model.split('/');
      if (parts.length === 2) {
        const [provider, model] = parts;
        return [{
          model: getLanguageModel(provider, model),
          candidate: { provider, model },
        }];
      }
    }

    // Fall back to first fast candidate
    if (this.fastCandidates.length > 0) {
      const c = this.fastCandidates[0];
      return [{
        model: getLanguageModel(c.provider, c.model),
        candidate: c,
      }];
    }

    return [];
  }
}
