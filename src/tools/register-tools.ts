import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext } from "../auth/middleware.js";
import type { AuditLogger } from "../audit/logger.js";
import { commandPolicy } from "../policy/command-policy.js";
import { PterodactylApiError } from "../pterodactyl/client.js";
import type { RateLimiter } from "../rate-limit.js";

export interface ToolContext {
  auth: AuthContext;
  audit: AuditLogger;
  rateLimiter: RateLimiter;
  clientIp?: string;
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function checkRateLimit(ctx: ToolContext, tool: string) {
  const result = ctx.rateLimiter.check(ctx.auth.tokenFingerprint);
  if (!result.allowed) {
    ctx.audit.log({
      userId: ctx.auth.account.id,
      userEmail: ctx.auth.account.email,
      tool,
      arguments: {},
      status: "denied",
      message: "Rate limit exceeded",
      clientIp: ctx.clientIp,
    });
    throw new Error(
      `Rate limit exceeded. Retry after ${result.retryAfterSeconds ?? 60} seconds.`,
    );
  }
}

export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({
    name: "pterodactyl-mcp",
    version: "0.1.0",
  });

  server.tool(
    "list_accessible_servers",
    "List all game servers the authenticated user has access to on this Pterodactyl panel.",
    {},
    async () => {
      checkRateLimit(ctx, "list_accessible_servers");
      try {
        const servers = await ctx.auth.client.listServers();
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "list_accessible_servers",
          arguments: {},
          status: "success",
          clientIp: ctx.clientIp,
        });
        return textResult({ servers, count: servers.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "list_accessible_servers",
          arguments: {},
          status: "error",
          message,
          clientIp: ctx.clientIp,
        });
        return errorResult(message);
      }
    },
  );

  server.tool(
    "get_server",
    "Get detailed information and effective permissions for a specific server.",
    {
      server_id: z
        .string()
        .min(8)
        .describe("Server short identifier (e.g. 1a2b3c4d) or full UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "get_server");
      try {
        const serverDetails = await ctx.auth.client.getServer(server_id);
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "get_server",
          serverId: server_id,
          arguments: { server_id },
          status: "success",
          clientIp: ctx.clientIp,
        });
        return textResult(serverDetails);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "get_server",
          serverId: server_id,
          arguments: { server_id },
          status: "error",
          message,
          clientIp: ctx.clientIp,
        });
        return errorResult(message);
      }
    },
  );

  server.tool(
    "get_server_resources",
    "Get real-time resource usage and power state for a server.",
    {
      server_id: z
        .string()
        .min(8)
        .describe("Server short identifier (e.g. 1a2b3c4d) or full UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "get_server_resources");
      try {
        const serverDetails = await ctx.auth.client.getServer(server_id);
        if (!ctx.auth.client.hasPermission(serverDetails, "control.console")) {
          ctx.audit.log({
            userId: ctx.auth.account.id,
            userEmail: ctx.auth.account.email,
            tool: "get_server_resources",
            serverId: server_id,
            arguments: { server_id },
            status: "denied",
            message: "Missing control.console permission",
            clientIp: ctx.clientIp,
          });
          return errorResult("You do not have permission to view this server's resources.");
        }

        const resources = await ctx.auth.client.getServerResources(server_id);
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "get_server_resources",
          serverId: server_id,
          arguments: { server_id },
          status: "success",
          clientIp: ctx.clientIp,
        });
        return textResult({ serverId: server_id, ...resources });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "get_server_resources",
          serverId: server_id,
          arguments: { server_id },
          status: "error",
          message,
          clientIp: ctx.clientIp,
        });
        return errorResult(message);
      }
    },
  );

  server.tool(
    "send_console_command",
    "Send a command to a running server's console. Blocked commands are rejected by policy.",
    {
      server_id: z
        .string()
        .min(8)
        .describe("Server short identifier (e.g. 1a2b3c4d) or full UUID"),
      command: z.string().min(1).max(512).describe("Console command to execute"),
    },
    async ({ server_id, command }) => {
      checkRateLimit(ctx, "send_console_command");
      const policy = commandPolicy.evaluate(command);
      if (!policy.allowed) {
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "send_console_command",
          serverId: server_id,
          arguments: { server_id, command },
          status: "denied",
          message: policy.reason,
          clientIp: ctx.clientIp,
        });
        return errorResult(policy.reason ?? "Command blocked by policy");
      }

      try {
        const serverDetails = await ctx.auth.client.getServer(server_id);
        if (!ctx.auth.client.hasPermission(serverDetails, "control.console")) {
          ctx.audit.log({
            userId: ctx.auth.account.id,
            userEmail: ctx.auth.account.email,
            tool: "send_console_command",
            serverId: server_id,
            arguments: { server_id, command },
            status: "denied",
            message: "Missing control.console permission",
            clientIp: ctx.clientIp,
          });
          return errorResult("You do not have permission to send console commands on this server.");
        }

        if (serverDetails.isSuspended || serverDetails.isInstalling) {
          ctx.audit.log({
            userId: ctx.auth.account.id,
            userEmail: ctx.auth.account.email,
            tool: "send_console_command",
            serverId: server_id,
            arguments: { server_id, command },
            status: "denied",
            message: "Server is not in a runnable state",
            clientIp: ctx.clientIp,
          });
          return errorResult("Server is suspended or still installing.");
        }

        await ctx.auth.client.sendCommand(server_id, command);
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "send_console_command",
          serverId: server_id,
          arguments: { server_id, command },
          status: "success",
          clientIp: ctx.clientIp,
        });
        return textResult({
          ok: true,
          serverId: server_id,
          command,
          message: "Command sent to server console.",
        });
      } catch (error) {
        const message =
          error instanceof PterodactylApiError
            ? `${error.message} (HTTP ${error.status})`
            : error instanceof Error
              ? error.message
              : "Unknown error";
        ctx.audit.log({
          userId: ctx.auth.account.id,
          userEmail: ctx.auth.account.email,
          tool: "send_console_command",
          serverId: server_id,
          arguments: { server_id, command },
          status: "error",
          message,
          clientIp: ctx.clientIp,
        });
        return errorResult(message);
      }
    },
  );

  return server;
}
