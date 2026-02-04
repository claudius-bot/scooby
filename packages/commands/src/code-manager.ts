import { randomInt } from 'node:crypto';

interface PendingCode {
  code: string;
  workspaceId: string;
  expiresAt: number;
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Manages workspace join codes.
 * Codes are 6-digit strings valid for 10 minutes.
 */
export class CodeManager {
  private pendingCodes = new Map<string, PendingCode>();

  /**
   * Generate a new 6-digit code for a workspace.
   */
  generate(workspaceId: string): string {
    this.cleanup();

    // Generate random 6-digit code
    const code = String(randomInt(0, 1000000)).padStart(6, '0');

    this.pendingCodes.set(code, {
      code,
      workspaceId,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    return code;
  }

  /**
   * Validate a code and return the workspace ID if valid.
   * Returns null if the code is invalid or expired.
   * The code is consumed (removed) on successful validation.
   */
  validate(code: string): string | null {
    this.cleanup();

    const pending = this.pendingCodes.get(code);
    if (!pending) {
      return null;
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingCodes.delete(code);
      return null;
    }

    // Consume the code
    this.pendingCodes.delete(code);
    return pending.workspaceId;
  }

  /**
   * Check if a code exists and is valid (without consuming it).
   */
  isValid(code: string): boolean {
    this.cleanup();
    const pending = this.pendingCodes.get(code);
    return pending !== undefined && Date.now() <= pending.expiresAt;
  }

  /**
   * Get the workspace ID for a code without consuming it.
   */
  peek(code: string): string | null {
    this.cleanup();
    const pending = this.pendingCodes.get(code);
    if (!pending || Date.now() > pending.expiresAt) {
      return null;
    }
    return pending.workspaceId;
  }

  /**
   * Remove expired codes.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [code, pending] of this.pendingCodes) {
      if (now > pending.expiresAt) {
        this.pendingCodes.delete(code);
      }
    }
  }
}
