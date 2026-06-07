import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createCommandPolicy } from "../policy/command-policy.js";
import { ConsoleSessionManager } from "../pterodactyl/console-session.js";
import type { Config } from "../config.js";
import type { AuthContext } from "../auth/middleware.js";
import type { AuditLogger } from "../audit/logger.js";
import type { RateLimiter } from "../rate-limit.js";
import type { McpContext } from "./context.js";
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
}

export function createMcpServer(options: CreateMcpServerOptions): McpServer {
  const ctx: McpContext = {
    auth: options.auth,
    audit: options.audit,
    rateLimiter: options.rateLimiter,
    config: options.config,
    clientIp: options.clientIp,
    consoleSessions: options.consoleSessions,
    commandPolicy: createCommandPolicy(
      options.config.commandPolicyMode,
      options.config.commandPolicyPreset,
    ),
  };

  const server = new McpServer({
    name: "pterodactyl-mcp",
    version: "0.2.0",
  });

  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx);

  return server;
}
