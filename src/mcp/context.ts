import type { AuthContext } from "../auth/middleware.js";
import type { AuditLogger } from "../audit/logger.js";
import type { Config } from "../config.js";
import type { ConsoleSessionManager } from "../pterodactyl/console-session.js";
import type { CommandPolicy } from "../policy/command-policy.js";
import type { RateLimiter } from "../rate-limit.js";

export interface McpContext {
  auth: AuthContext;
  audit: AuditLogger;
  rateLimiter: RateLimiter;
  consoleSessions: ConsoleSessionManager;
  commandPolicy: CommandPolicy;
  config: Config;
  clientIp?: string;
}

export function sessionKey(ctx: McpContext, serverId: string): string {
  return `${ctx.auth.tokenFingerprint}:${serverId}`;
}
