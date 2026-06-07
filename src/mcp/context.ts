import type { AuthContext } from "../auth/middleware.js";
import type { AuditLogger } from "../audit/logger.js";
import type { Config } from "../config.js";
import type { ConsoleSessionManager } from "../pterodactyl/console-session.js";
import type { PolicyResolver } from "../policy/policy-resolver.js";
import type { ConfirmationStore } from "../power/confirmation-store.js";
import type { RateLimiter } from "../rate-limit.js";

export interface McpContext {
  auth: AuthContext;
  audit: AuditLogger;
  rateLimiter: RateLimiter;
  consoleSessions: ConsoleSessionManager;
  policyResolver: PolicyResolver;
  confirmationStore: ConfirmationStore;
  config: Config;
  clientIp?: string;
}

export function sessionKey(ctx: McpContext, serverId: string): string {
  return `${ctx.auth.tokenFingerprint}:${serverId}`;
}
