import type { AgentProfile } from '../workspace/types.js';

export interface PromptContext {
  agent: AgentProfile;
  skills: SkillDefinition[];
  memoryContext: string[];     // relevant memory chunks
  timestamp: Date;
  workspaceId: string;
  workspacePath: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  instructions: string;
  always?: boolean;
  modelGroup?: 'fast' | 'slow';
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  // 1. Identity
  if (ctx.agent.identity) {
    parts.push(`# Identity\n\n${ctx.agent.identity}`);
  }

  // 2. Soul / personality
  if (ctx.agent.soul) {
    parts.push(`# Soul\n\n${ctx.agent.soul}`);
  }

  // 3. Bootstrap instructions
  if (ctx.agent.bootstrap) {
    parts.push(`# Instructions\n\n${ctx.agent.bootstrap}`);
  }

  // 4. Tool preferences
  if (ctx.agent.tools) {
    parts.push(`# Tool Usage\n\n${ctx.agent.tools}`);
  }

  // 5. Active skills
  const activeSkills = ctx.skills.filter(s => s.always || true); // all loaded skills are active
  if (activeSkills.length > 0) {
    const skillsText = activeSkills.map(s =>
      `## Skill: ${s.name}\n${s.description}\n\n${s.instructions}`
    ).join('\n\n');
    parts.push(`# Skills\n\n${skillsText}`);
  }

  // 6. Memory context
  if (ctx.memoryContext.length > 0) {
    parts.push(`# Relevant Memory\n\n${ctx.memoryContext.join('\n\n---\n\n')}`);
  }

  // 7. Context
  parts.push(`# Context\n\nCurrent time: ${ctx.timestamp.toISOString()}\nWorkspace: ${ctx.workspaceId}\nWorkspace path: ${ctx.workspacePath}`);

  return parts.join('\n\n---\n\n');
}
