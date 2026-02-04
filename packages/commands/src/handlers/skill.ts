import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /skill command handler.
 */
export function createSkillCommand(): CommandDefinition {
  return {
    name: 'skill',
    aliases: ['skills', 's'],
    description: 'List or invoke a skill',
    usage: '/skill [name]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      if (!ctx.getSkills) {
        const response = 'Skills not available.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      const skills = await ctx.getSkills();

      if (args) {
        // User wants to invoke or get info about a specific skill
        const skillName = args.toLowerCase();
        const skill = skills.find((s) => s.name.toLowerCase() === skillName);

        if (!skill) {
          const response = `Skill "${args}" not found. Use /skill to list available skills.`;
          await ctx.sendReply(response, 'text');
          return { handled: true, response, suppressTranscript: true };
        }

        const lines = [
          `**Skill: ${skill.name}**`,
          '',
          skill.description || 'No description available.',
          '',
          `**Always active:** ${skill.always ? 'Yes' : 'No'}`,
        ];
        if (skill.modelGroup) {
          lines.push(`**Model group:** ${skill.modelGroup}`);
        }

        const response = lines.join('\n');
        await ctx.sendReply(response, 'markdown');
        return { handled: true, response, suppressTranscript: true };
      }

      // List all skills
      if (skills.length === 0) {
        const response = 'No skills available. Add skills to the `skills/` directory.';
        await ctx.sendReply(response, 'text');
        return { handled: true, response, suppressTranscript: true };
      }

      const lines = [
        '**Available Skills**',
        '',
        ...skills.map((s) => {
          const always = s.always ? ' (always active)' : '';
          return `\`${s.name}\`${always} - ${s.description || 'No description'}`;
        }),
        '',
        'Use `/skill <name>` for more info about a skill.',
      ];

      const response = lines.join('\n');
      await ctx.sendReply(response, 'markdown');

      return { handled: true, response, suppressTranscript: true };
    },
  };
}
