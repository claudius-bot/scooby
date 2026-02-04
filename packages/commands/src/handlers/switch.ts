import type { CommandDefinition, CommandResult, CommandContext } from '../types.js';

/**
 * Create the /switch command handler.
 */
export function createSwitchCommand(): CommandDefinition {
  return {
    name: 'switch',
    aliases: ['workspace', 'ws'],
    description: 'Switch to a different workspace',
    usage: '/switch [code or name]',
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

      // Otherwise, treat as workspace name
      return handleNameSwitch(arg, ctx);
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
    'Use `/switch <name>` to switch workspaces.',
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

async function handleNameSwitch(name: string, ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.findWorkspaceByName || !ctx.switchWorkspace || !ctx.getAccessibleWorkspaces) {
    const response = 'Workspace switching not available.';
    await ctx.sendReply(response, 'text');
    return { handled: true, response, suppressTranscript: true };
  }

  // Find workspace by name
  const workspaceId = ctx.findWorkspaceByName(name);
  if (!workspaceId) {
    const response = `No workspace found with name "${name}".\n\nUse \`/switch\` to see available workspaces.`;
    await ctx.sendReply(response, 'markdown');
    return { handled: true, response, suppressTranscript: true };
  }

  // Check if user has access
  const workspaces = await ctx.getAccessibleWorkspaces();
  const workspace = workspaces.find((ws) => ws.id === workspaceId);

  if (!workspace || !workspace.hasAccess) {
    const response = `You don't have access to workspace "${name}".\n\nYou need a workspace code to join. Ask someone in that workspace to run \`/gen-code\`.`;
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
  const success = await ctx.switchWorkspace(workspaceId);

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
