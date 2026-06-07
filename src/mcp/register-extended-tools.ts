import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ActionConfirmationStore } from "../confirmation/action-store.js";
import { normalizeWritablePath } from "../files/path-policy.js";
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

export function registerExtendedTools(server: McpServer, ctx: McpContext): void {
  if (ctx.config.enableFileWrite) {
    server.tool(
      "write_server_file",
      "Write or update a server file. Requires confirmation and file.update permission. Disabled unless ENABLE_FILE_WRITE=true.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        file_path: z.string().min(1).describe("Absolute path to the file"),
        content: z.string().describe("File content to write"),
        confirmation_token: z
          .string()
          .optional()
          .describe("Token from a prior write_server_file call that returned requires_confirmation"),
      },
      async ({ server_id, file_path, content, confirmation_token }) => {
        checkRateLimit(ctx, "write_server_file");
        const args = {
          server_id,
          file_path,
          content_bytes: new TextEncoder().encode(content).length,
          confirmation_token: confirmation_token ? "[redacted]" : undefined,
        };

        const pathResult = normalizeWritablePath(file_path);
        if (!pathResult.valid || !pathResult.normalized) {
          auditDenied(ctx, "write_server_file", args, pathResult.reason ?? "Invalid path", server_id);
          return errorResult(pathResult.reason ?? "Invalid path");
        }

        const byteLength = new TextEncoder().encode(content).length;
        if (byteLength > ctx.config.fileMaxWriteBytes) {
          auditDenied(ctx, "write_server_file", args, "Content exceeds max write size", server_id);
          return errorResult(
            `Content exceeds maximum write size of ${ctx.config.fileMaxWriteBytes} bytes.`,
          );
        }

        const fingerprint = ActionConfirmationStore.writeFileFingerprint(
          server_id,
          pathResult.normalized,
          content,
        );

        if (!confirmation_token) {
          try {
            await requireServerWithPermission(ctx, server_id, "file.update", "write_server_file");
          } catch (error) {
            const message = formatPterodactylError(error);
            auditDenied(ctx, "write_server_file", args, message, server_id);
            return errorResult(message);
          }

          const pending = ctx.actionConfirmationStore.create(
            ctx.auth.account.id,
            server_id,
            "write_file",
            fingerprint,
          );
          auditSuccess(ctx, "write_server_file", { ...args, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            server_id,
            file_path: pathResult.normalized,
            byteLength,
            message:
              "File write requires confirmation. Call write_server_file again with confirmation_token.",
          });
        }

        const confirmed = ctx.actionConfirmationStore.consume(
          confirmation_token,
          ctx.auth.account.id,
          server_id,
          "write_file",
          fingerprint,
        );
        if (!confirmed.ok) {
          auditDenied(ctx, "write_server_file", args, confirmed.reason, server_id);
          return errorResult(confirmed.reason);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "file.update", "write_server_file");
          await ctx.auth.client.writeFile(server_id, pathResult.normalized, content);
          auditSuccess(ctx, "write_server_file", args, server_id);
          return textResult({
            ok: true,
            serverId: server_id,
            filePath: pathResult.normalized,
            byteLength,
          });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "write_server_file", args, message, server_id);
          return errorResult(message);
        }
      },
    );
  }

  server.tool(
    "list_server_backups",
    "List backups for a server. Requires backup.read permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "list_server_backups");
      const args = { server_id };
      try {
        await requireServerWithPermission(ctx, server_id, "backup.read", "list_server_backups");
        const backups = await ctx.auth.client.listBackups(server_id);
        auditSuccess(ctx, "list_server_backups", args, server_id);
        return textResult({ serverId: server_id, count: backups.length, backups });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "list_server_backups", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  if (ctx.config.enableBackups) {
    server.tool(
      "create_server_backup",
      "Create a server backup. Requires confirmation and backup.create permission. Rate limited per server. Disabled unless ENABLE_BACKUPS=true.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        name: z.string().optional().describe("Optional backup name"),
        ignored: z
          .string()
          .optional()
          .describe("Newline-separated glob patterns to exclude"),
        confirmation_token: z
          .string()
          .optional()
          .describe("Token from a prior create_server_backup call that returned requires_confirmation"),
      },
      async ({ server_id, name, ignored, confirmation_token }) => {
        checkRateLimit(ctx, "create_server_backup");
        const args = { server_id, name, ignored, confirmation_token: confirmation_token ? "[redacted]" : undefined };

        const rateCheck = ctx.backupRateLimiter.check(server_id);
        if (!rateCheck.allowed) {
          auditDenied(ctx, "create_server_backup", args, "Backup rate limit exceeded", server_id);
          return errorResult(
            `Backup rate limit exceeded. Retry after ${rateCheck.retryAfterSeconds ?? 3600} seconds.`,
          );
        }

        const fingerprint = ActionConfirmationStore.fingerprint(
          "create_backup",
          server_id,
          name ?? "default",
        );

        if (!confirmation_token) {
          try {
            await requireServerWithPermission(ctx, server_id, "backup.create", "create_server_backup");
          } catch (error) {
            const message = formatPterodactylError(error);
            auditDenied(ctx, "create_server_backup", args, message, server_id);
            return errorResult(message);
          }

          const pending = ctx.actionConfirmationStore.create(
            ctx.auth.account.id,
            server_id,
            "create_backup",
            fingerprint,
          );
          auditSuccess(ctx, "create_server_backup", { ...args, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            server_id,
            name,
            message:
              "Backup creation requires confirmation. Call create_server_backup again with confirmation_token.",
          });
        }

        const confirmed = ctx.actionConfirmationStore.consume(
          confirmation_token,
          ctx.auth.account.id,
          server_id,
          "create_backup",
          fingerprint,
        );
        if (!confirmed.ok) {
          auditDenied(ctx, "create_server_backup", args, confirmed.reason, server_id);
          return errorResult(confirmed.reason);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "backup.create", "create_server_backup");
          const backup = await ctx.auth.client.createBackup(server_id, { name, ignored });
          ctx.backupRateLimiter.record(server_id);
          auditSuccess(ctx, "create_server_backup", args, server_id);
          return textResult({
            ok: true,
            serverId: server_id,
            backup,
            message: "Backup creation started. Poll list_server_backups until completed_at is set.",
          });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "create_server_backup", args, message, server_id);
          return errorResult(message);
        }
      },
    );
  }
}
