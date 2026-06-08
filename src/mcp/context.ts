import type { AuthContext } from "../auth/middleware.js";
import type { AuditLogger } from "../audit/logger.js";
import type { Config } from "../config.js";
import type { ActionConfirmationStore, BackupRateLimiter } from "../confirmation/action-store.js";
import type { ConsoleSessionManager } from "../pterodactyl/console-session.js";
import type { PolicyResolver } from "../policy/policy-resolver.js";
import type { ConfirmationStore } from "../power/confirmation-store.js";
import type { RateLimiter } from "../rate-limit.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import type { PterodactylApplicationClient } from "../pterodactyl/application-client.js";

export interface McpContext {
  auth: AuthContext;
  audit: AuditLogger;
  rateLimiter: RateLimiter;
  consoleSessions: ConsoleSessionManager;
  policyResolver: PolicyResolver;
  confirmationStore: ConfirmationStore;
  actionConfirmationStore: ActionConfirmationStore;
  backupRateLimiter: BackupRateLimiter;
  metrics: MetricsRegistry;
  config: Config;
  applicationClient?: PterodactylApplicationClient;
  clientIp?: string;
}

export function sessionKey(ctx: McpContext, serverId: string): string {
  return `${ctx.auth.tokenFingerprint}:${serverId}`;
}
