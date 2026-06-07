import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadPolicyOverrides, PolicyResolver } from "../policy/policy-resolver.js";
import { ConsoleSessionManager } from "../pterodactyl/console-session.js";
import { ConfirmationStore } from "../power/confirmation-store.js";
import type { Config } from "../config.js";
import type { AuthContext } from "../auth/middleware.js";
import type { AuditLogger } from "../audit/logger.js";
import type { RateLimiter } from "../rate-limit.js";
import { registerPrompts } from "./register-prompts.js";
import { registerResources } from "./register-resources.js";
import { registerTools } from "./register-tools.js";

export interface CreateMcpServerOptions {
  auth: AuthContext;
  audit: AuditLogger;
  rateLimiter: RateLimiter;
  config: Config;
  clientIp?: string;
  consoleSessions: ConsoleSessionManager;
  confirmationStore: ConfirmationStore;
}

export function createMcpServer(options: CreateMcpServerOptions): McpServer {
  const policyResolver = new PolicyResolver(
    options.config.commandPolicyMode,
    options.config.commandPolicyPreset,
    loadPolicyOverrides(options.config.policyOverridesPath),
  );

  const ctx = {
    auth: options.auth,
    audit: options.audit,
    rateLimiter: options.rateLimiter,
    config: options.config,
    clientIp: options.clientIp,
    consoleSessions: options.consoleSessions,
    confirmationStore: options.confirmationStore,
    policyResolver,
  };

  const server = new McpServer({
    name: "pterodactyl-mcp",
    version: "0.3.0",
  });

  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx);

  return server;
}
