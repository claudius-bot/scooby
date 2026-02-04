import { resolve, relative } from 'node:path';

export interface PermissionContext {
  allowedTools: Set<string> | null;
  deniedTools: Set<string>;
  sandbox: boolean;
  workspacePath: string;
}

export function checkToolPermission(toolName: string, permissions: PermissionContext): boolean {
  if (permissions.deniedTools.has(toolName)) return false;
  if (permissions.allowedTools !== null && !permissions.allowedTools.has(toolName)) return false;
  return true;
}

export function resolveSandboxedPath(filePath: string, permissions: PermissionContext): string {
  // Resolve to absolute path
  // If sandbox mode, validate the resolved path is within workspacePath
  // Throw error if path escapes sandbox
  // Return resolved absolute path
  const resolved = resolve(permissions.workspacePath, filePath);
  if (permissions.sandbox) {
    const rel = relative(permissions.workspacePath, resolved);
    if (rel.startsWith('..') || resolve(permissions.workspacePath, rel) !== resolved) {
      throw new Error(`Path "${filePath}" escapes workspace sandbox at "${permissions.workspacePath}"`);
    }
  }
  return resolved;
}
