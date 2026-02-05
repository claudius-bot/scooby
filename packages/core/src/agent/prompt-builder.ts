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

  // 0. Onboarding (if not configured)
  if (!ctx.agent.configured) {
    let onboardingText = `# Onboarding

You are a new, unconfigured assistant. This workspace has just been created and needs to be set up.

Your first task is to help the user configure you. Guide them through the setup process:

1. **Name**: Ask what they'd like to call you
2. **Personality/Vibe**: Ask what personality or vibe they want (e.g., professional, casual, friendly, technical)
3. **Emoji**: Ask them to pick an emoji that represents you

Once they provide these details, use the file_write tool to update the IDENTITY.md file with:
- The name, vibe, and emoji in the frontmatter
- Set \`configured: true\` in the frontmatter
- Write a brief identity description in the body

Be friendly and welcoming during this process.`;

    if (ctx.agent.welcomeContext) {
      onboardingText += `\n\n## Welcome Context\n\nThe user provided this context when creating the workspace:\n\n"${ctx.agent.welcomeContext}"\n\nUse this to personalize your greeting and approach.`;
    }

    parts.push(onboardingText);
  }

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

  // 7. Scratchpad
  if (ctx.agent.scratchpad) {
    parts.push(`# Scratchpad (Short-term Notes)

These are your temporary notes. Update or clear them using scratchpad_write.
Remove items when no longer relevant.

${ctx.agent.scratchpad}`);
  }

  // 8. Context
  parts.push(`# Context\n\nCurrent time: ${ctx.timestamp.toISOString()}\nWorkspace: ${ctx.workspaceId}\nWorkspace path: ${ctx.workspacePath}`);

  return parts.join('\n\n---\n\n');
}
