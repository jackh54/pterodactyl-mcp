import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizeServerPath } from "../files/path-policy.js";
import {
  auditError,
  auditSuccess,
  checkRateLimit,
  errorResult,
  fetchConsoleOutput,
  formatPterodactylError,
  requireServerWithPermission,
  textResult,
} from "./helpers.js";
import type { McpContext } from "./context.js";

export function registerBulkTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "bulk_get_server_resources",
    "Get resource usage for multiple servers in one call.",
    {
      server_ids: z
        .array(z.string().min(8))
        .min(1)
        .max(50)
        .describe("Server identifiers to query"),
    },
    async ({ server_ids }) => {
      checkRateLimit(ctx, "bulk_get_server_resources");
      const limited = server_ids.slice(0, ctx.config.bulkMaxServers);
      const args = { server_ids: limited };

      const results: Array<{
        serverId: string;
        ok: boolean;
        resources?: Record<string, unknown>;
        error?: string;
      }> = [];

      for (const serverId of limited) {
        try {
          await requireServerWithPermission(ctx, serverId, "control.console", "bulk_get_server_resources");
          const resources = await ctx.auth.client.getServerResources(serverId);
          results.push({ serverId, ok: true, resources: { serverId, ...resources } });
        } catch (error) {
          results.push({
            serverId,
            ok: false,
            error: formatPterodactylError(error),
          });
        }
      }

      auditSuccess(ctx, "bulk_get_server_resources", args);
      return textResult({
        count: results.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    },
  );

  server.tool(
    "bulk_read_server_files",
    "Read the same file path from multiple servers for bulk inspection.",
    {
      server_ids: z
        .array(z.string().min(8))
        .min(1)
        .max(50)
        .describe("Server identifiers to query"),
      file_path: z.string().min(1).describe("Absolute path to read from each server"),
    },
    async ({ server_ids, file_path }) => {
      checkRateLimit(ctx, "bulk_read_server_files");
      const pathResult = normalizeServerPath(file_path);
      if (!pathResult.valid || !pathResult.normalized) {
        return errorResult(pathResult.reason ?? "Invalid path");
      }

      const limited = server_ids.slice(0, ctx.config.bulkMaxServers);
      const args = { server_ids: limited, file_path: pathResult.normalized };

      const results: Array<{
        serverId: string;
        ok: boolean;
        content?: string;
        byteLength?: number;
        truncated?: boolean;
        error?: string;
      }> = [];

      for (const serverId of limited) {
        try {
          await requireServerWithPermission(ctx, serverId, "file.read-content", "bulk_read_server_files");
          const downloaded = await ctx.auth.client.downloadFileContent(
            serverId,
            pathResult.normalized,
            ctx.config.fileMaxReadBytes,
          );
          results.push({
            serverId,
            ok: true,
            content: downloaded.isBinary ? `[base64] ${downloaded.content}` : downloaded.content,
            byteLength: downloaded.byteLength,
            truncated: downloaded.truncated,
          });
        } catch (error) {
          results.push({
            serverId,
            ok: false,
            error: formatPterodactylError(error),
          });
        }
      }

      auditSuccess(ctx, "bulk_read_server_files", args);
      return textResult({
        filePath: pathResult.normalized,
        count: results.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    },
  );

  server.tool(
    "bulk_get_console_output",
    "Fetch recent console output from multiple servers with optional search filtering.",
    {
      server_ids: z
        .array(z.string().min(8))
        .min(1)
        .max(50)
        .describe("Server identifiers to query"),
      max_lines: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max lines per server (default from config)"),
      search: z.string().optional().describe("Filter lines containing this text"),
      regex: z.boolean().optional().describe("Treat search as regex"),
      case_insensitive: z.boolean().optional().describe("Case-insensitive search"),
    },
    async ({ server_ids, max_lines, search, regex, case_insensitive }) => {
      checkRateLimit(ctx, "bulk_get_console_output");
      const limited = server_ids.slice(0, ctx.config.bulkMaxServers);
      const args = { server_ids: limited, max_lines, search, regex, case_insensitive };

      const results: Array<{
        serverId: string;
        ok: boolean;
        source?: string;
        lineCount?: number;
        lines?: string[];
        error?: string;
      }> = [];

      for (const serverId of limited) {
        try {
          const output = await fetchConsoleOutput(
            ctx,
            serverId,
            "bulk_get_console_output",
            max_lines ?? ctx.config.consoleMaxLines,
            { query: search, regex, caseInsensitive: case_insensitive },
          );
          results.push({
            serverId,
            ok: true,
            source: output.source,
            lineCount: output.lines.length,
            lines: output.lines,
          });
        } catch (error) {
          results.push({
            serverId,
            ok: false,
            error: formatPterodactylError(error),
          });
        }
      }

      auditSuccess(ctx, "bulk_get_console_output", args);
      return textResult({
        count: results.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    },
  );
}
