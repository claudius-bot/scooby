import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /switch command handler.
 */
export function createSwitchCommand(): CommandDefinition {
  return {
    name: 'switch',
    aliases: ['workspace', 'ws'],
    description: 'Switch to a different workspace',
    usage: '/switch [code or id]',
    handler: async (args: string, ctx: CommandContext): Promise<CommandResult> => {
      const arg = args.trim();

      // No argument - list accessible workspaces
      if (!arg) {
        return handleListWorkspaces(ctx);
      }

      // Check if argument is a 6-digit code
      if (/^\d{6}$/.test(arg)) {
        return handleCodeSwitch(arg, ctx);
      }

      // Otherwise, treat as workspace ID
      return handleIdSwitch(arg, ctx);
    },
  };
}

async function handleListWorkspaces(ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.getAccessibleWorkspaces) {
    const response = 'Workspace listing not available.';
    await ctx.sendReply(response, 'text');
    return { handled: true, response, suppressTranscript: true };
  }

  const workspaces = await ctx.getAccessibleWorkspaces();

  if (workspaces.length === 0) {
    const response = 'You don\'t have access to any workspaces yet.\n\nUse a workspace code to join one, or create a new workspace with `/new-workspace <name>`.';
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  }

  const lines = [
    '**Available Workspaces**',
    '',
    ...workspaces.map((ws) => {
      const current = ws.isCurrentlyConnected ? ' *(current)*' : '';
      const access = ws.hasAccess ? '' : ' (no access)';
      return `${ws.emoji} **${ws.name}** (\`${ws.id}\`)${current}${access}`;
    }),
    '',
    'Use `/switch <id>` to switch workspaces.',
    'Use `/switch <code>` to join with a workspace code.',
  ];

  const response = lines.join('\n');
  await ctx.sendReply(response, 'markdown');
  return { handled: true, response, suppressTranscript: true };
}

async function handleCodeSwitch(code: string, ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.switchWorkspace) {
    const response = 'Workspace switching not available.';
    await ctx.sendReply(response, 'text');
    return { handled: true, response, suppressTranscript: true };
  }

  // The switchWorkspace function will validate the code and handle the switch
  // If the code is valid, it connects to that workspace
  const success = await ctx.switchWorkspace(code);

  if (success) {
    // Response will be sent by the switch function with workspace details
    return { handled: true, suppressTranscript: true };
  } else {
    const response = 'Invalid or expired code. Please request a new code from the workspace using `/gen-code`.';
    await ctx.sendReply(response, 'text');
    return { handled: true, response, suppressTranscript: true };
  }
}

async function handleIdSwitch(id: string, ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.switchWorkspace || !ctx.getAccessibleWorkspaces) {
    const response = 'Workspace switching not available.';
    await ctx.sendReply(response, 'text');
    return { handled: true, response, suppressTranscript: true };
  }

  // Get accessible workspaces and find by ID
  const workspaces = await ctx.getAccessibleWorkspaces();
  const workspace = workspaces.find((ws) => ws.id === id);

  if (!workspace) {
    const response = `No workspace found with ID "${id}".\n\nUse \`/switch\` to see available workspaces.`;
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  }

  if (!workspace.hasAccess) {
    const response = `You don't have access to workspace "${id}".\n\nYou need a workspace code to join. Ask someone in that workspace to run \`/gen-code\`.`;
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  }

  // Already connected to this workspace
  if (workspace.isCurrentlyConnected) {
    const response = `You're already connected to ${workspace.emoji} **${workspace.name}**.`;
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  }

  // Switch to the workspace
  const success = await ctx.switchWorkspace(id);

  if (success) {
    const response = `Switched to ${workspace.emoji} **${workspace.name}**.`;
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  } else {
    const response = 'Failed to switch workspaces. Please try again.';
    await ctx.sendReply(response, 'text');
    return { handled: true, response, suppressTranscript: true };
  }
}
