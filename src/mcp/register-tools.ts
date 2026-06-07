import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpContext } from "./context.js";
import { sessionKey } from "./context.js";
import { registerFileTools } from "./register-file-tools.js";
import { registerExtendedTools } from "./register-extended-tools.js";
import { registerPowerTools } from "./register-power-tools.js";
import {
  auditDenied,
  auditError,
  auditSuccess,
  checkRateLimit,
  errorResult,
  formatPterodactylError,
  fetchConsoleOutput,
  prepareConsoleAccess,
  requireServerWithConsole,
  textResult,
} from "./helpers.js";

export function registerTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "list_accessible_servers",
    "List all game servers the authenticated user has access to on this Pterodactyl panel.",
    {},
    async () => {
      checkRateLimit(ctx, "list_accessible_servers");
      try {
        const servers = await ctx.auth.client.listServers();
        auditSuccess(ctx, "list_accessible_servers", {});
        return textResult({ servers, count: servers.length });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "list_accessible_servers", {}, message);
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
      const args = { server_id };
      try {
        const serverDetails = await ctx.auth.client.getServer(server_id);
        auditSuccess(ctx, "get_server", args, server_id);
        return textResult(serverDetails);
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "get_server", args, message, server_id);
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
      const args = { server_id };
      try {
        await requireServerWithConsole(ctx, server_id, "get_server_resources");
        const resources = await ctx.auth.client.getServerResources(server_id);
        auditSuccess(ctx, "get_server_resources", args, server_id);
        return textResult({ serverId: server_id, ...resources });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "get_server_resources", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "get_console_output",
    "Fetch recent console log lines. Uses server log files when available (fast), otherwise Wings WebSocket.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      max_lines: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of log lines to return (default from server config)"),
    },
    async ({ server_id, max_lines }) => {
      checkRateLimit(ctx, "get_console_output");
      const args = { server_id, max_lines };
      try {
        const result = await fetchConsoleOutput(
          ctx,
          server_id,
          "get_console_output",
          max_lines ?? ctx.config.consoleMaxLines,
        );

        auditSuccess(ctx, "get_console_output", args, server_id);
        return textResult({
          serverId: server_id,
          source: result.source,
          filePath: result.filePath,
          lineCount: result.lines.length,
          lines: result.lines,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "get_console_output", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "send_console_command",
    "Send a command to a running server's console. Blocked commands are rejected by policy. Optionally wait for console output.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      command: z.string().min(1).max(512).describe("Console command to execute"),
      wait_for_output: z
        .boolean()
        .optional()
        .describe("If true, collect console output after sending the command"),
    },
    async ({ server_id, command, wait_for_output }) => {
      checkRateLimit(ctx, "send_console_command");
      const args = { server_id, command, wait_for_output };

      try {
        const serverDetails = await requireServerWithConsole(ctx, server_id, "send_console_command");
        const policy = ctx.policyResolver.forServer(server_id, serverDetails).evaluate(command);
        if (!policy.allowed) {
          auditDenied(ctx, "send_console_command", args, policy.reason ?? "Command blocked", server_id);
          return errorResult(policy.reason ?? "Command blocked by policy");
        }

        if (wait_for_output) {
          const { credentials } = await prepareConsoleAccess(ctx, server_id, "send_console_command");
          const result = await ctx.consoleSessions.withSession(
            sessionKey(ctx, server_id),
            server_id,
            credentials,
            (session) =>
              session.sendCommandAndCollect(command, {
                maxLines: Math.min(ctx.config.consoleMaxLines, 50),
                timeoutMs: ctx.config.consoleTimeoutMs,
                idleMs: ctx.config.consoleIdleMs,
              }),
          );
          auditSuccess(ctx, "send_console_command", args, server_id);
          return textResult({
            ok: true,
            serverId: server_id,
            policyMode: policy.mode,
            ...result,
          });
        }

        const resources = await ctx.auth.client.getServerResources(server_id);
        if (resources.currentState !== "running") {
          auditDenied(
            ctx,
            "send_console_command",
            args,
            `Server is ${resources.currentState}`,
            server_id,
          );
          return errorResult(
            `Console unavailable: server is ${resources.currentState}. Start the server first.`,
          );
        }

        await ctx.auth.client.sendCommand(server_id, command);
        auditSuccess(ctx, "send_console_command", args, server_id);
        return textResult({
          ok: true,
          serverId: server_id,
          command,
          policyMode: policy.mode,
          message: "Command sent to server console.",
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "send_console_command", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  registerPowerTools(server, ctx);
  registerFileTools(server, ctx);
  registerExtendedTools(server, ctx);
}
