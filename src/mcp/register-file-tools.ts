import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizeServerPath, truncateContent } from "../files/path-policy.js";
import {
  auditDenied,
  auditError,
  auditSuccess,
  checkRateLimit,
  errorResult,
  formatPterodactylError,
  requireServerWithPermission,
  textResult,
} from "./helpers.js";
import type { McpContext } from "./context.js";

export function registerFileTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "list_server_files",
    "List files and directories in a server folder. Requires file.read permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      directory: z
        .string()
        .default("/")
        .describe("Directory path to list (default: /)"),
    },
    async ({ server_id, directory }) => {
      checkRateLimit(ctx, "list_server_files");
      const args = { server_id, directory };

      const pathResult = normalizeServerPath(directory);
      if (!pathResult.valid || !pathResult.normalized) {
        auditDenied(ctx, "list_server_files", args, pathResult.reason ?? "Invalid path", server_id);
        return errorResult(pathResult.reason ?? "Invalid path");
      }

      try {
        await requireServerWithPermission(ctx, server_id, "file.read", "list_server_files");
        const entries = await ctx.auth.client.listFiles(server_id, pathResult.normalized);
        auditSuccess(ctx, "list_server_files", args, server_id);
        return textResult({
          serverId: server_id,
          directory: pathResult.normalized,
          count: entries.length,
          entries,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "list_server_files", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "read_server_file",
    "Read the contents of a server file. Requires file.read-content permission. Output is size-capped.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      file_path: z.string().min(1).describe("Absolute path to the file (e.g. /server.properties)"),
    },
    async ({ server_id, file_path }) => {
      checkRateLimit(ctx, "read_server_file");
      const args = { server_id, file_path };

      const pathResult = normalizeServerPath(file_path);
      if (!pathResult.valid || !pathResult.normalized) {
        auditDenied(ctx, "read_server_file", args, pathResult.reason ?? "Invalid path", server_id);
        return errorResult(pathResult.reason ?? "Invalid path");
      }

      try {
        await requireServerWithPermission(ctx, server_id, "file.read-content", "read_server_file");
        const raw = await ctx.auth.client.readFile(server_id, pathResult.normalized);
        const truncated = truncateContent(raw, ctx.config.fileMaxReadBytes);

        auditSuccess(ctx, "read_server_file", args, server_id);
        return textResult({
          serverId: server_id,
          filePath: pathResult.normalized,
          truncated: truncated.truncated,
          byteLength: truncated.byteLength,
          maxBytes: ctx.config.fileMaxReadBytes,
          content: truncated.content,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "read_server_file", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "get_server_activity",
    "Get recent audit/activity log entries for a server.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page (default 25, max 100)"),
    },
    async ({ server_id, page, per_page }) => {
      checkRateLimit(ctx, "get_server_activity");
      const args = { server_id, page, per_page };

      try {
        await requireServerWithPermission(ctx, server_id, "activity.read", "get_server_activity");
        const activity = await ctx.auth.client.getServerActivity(
          server_id,
          page ?? 1,
          per_page ?? 25,
        );
        auditSuccess(ctx, "get_server_activity", args, server_id);
        return textResult({
          serverId: server_id,
          count: activity.length,
          activity,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "get_server_activity", args, message, server_id);
        return errorResult(message);
      }
    },
  );
}
