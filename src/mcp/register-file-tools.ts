import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ActionConfirmationStore } from "../confirmation/action-store.js";
import { normalizeServerPath, normalizeWritablePath, truncateContent } from "../files/path-policy.js";
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
    "get_server_file_download_url",
    "Get a signed one-time download URL for a server file. Requires file.read-content permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      file_path: z.string().min(1).describe("Absolute path to the file"),
    },
    async ({ server_id, file_path }) => {
      checkRateLimit(ctx, "get_server_file_download_url");
      const args = { server_id, file_path };

      const pathResult = normalizeServerPath(file_path);
      if (!pathResult.valid || !pathResult.normalized) {
        auditDenied(ctx, "get_server_file_download_url", args, pathResult.reason ?? "Invalid path", server_id);
        return errorResult(pathResult.reason ?? "Invalid path");
      }

      try {
        await requireServerWithPermission(ctx, server_id, "file.read-content", "get_server_file_download_url");
        const url = await ctx.auth.client.getFileDownloadUrl(server_id, pathResult.normalized);
        auditSuccess(ctx, "get_server_file_download_url", args, server_id);
        return textResult({
          serverId: server_id,
          filePath: pathResult.normalized,
          downloadUrl: url,
          expiresInMinutes: 15,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "get_server_file_download_url", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "download_server_file",
    "Download a server file via signed URL for bulk inspection. Returns text or base64 for binary files.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      file_path: z.string().min(1).describe("Absolute path to the file"),
    },
    async ({ server_id, file_path }) => {
      checkRateLimit(ctx, "download_server_file");
      const args = { server_id, file_path };

      const pathResult = normalizeServerPath(file_path);
      if (!pathResult.valid || !pathResult.normalized) {
        auditDenied(ctx, "download_server_file", args, pathResult.reason ?? "Invalid path", server_id);
        return errorResult(pathResult.reason ?? "Invalid path");
      }

      try {
        await requireServerWithPermission(ctx, server_id, "file.read-content", "download_server_file");
        const downloaded = await ctx.auth.client.downloadFileContent(
          server_id,
          pathResult.normalized,
          ctx.config.fileMaxReadBytes,
        );
        auditSuccess(ctx, "download_server_file", args, server_id);
        return textResult({
          serverId: server_id,
          filePath: pathResult.normalized,
          encoding: downloaded.isBinary ? "base64" : "utf-8",
          truncated: downloaded.truncated,
          byteLength: downloaded.byteLength,
          maxBytes: ctx.config.fileMaxReadBytes,
          content: downloaded.content,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "download_server_file", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  if (ctx.config.enableFileMutations) {
    server.tool(
      "upload_server_file",
      "Upload a file to a server directory. Requires file.create permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        directory: z.string().default("/").describe("Target directory path"),
        filename: z.string().min(1).describe("Filename to create"),
        content: z.string().describe("File content (text)"),
      },
      async ({ server_id, directory, filename, content }) => {
        checkRateLimit(ctx, "upload_server_file");
        const args = {
          server_id,
          directory,
          filename,
          content_bytes: new TextEncoder().encode(content).length,
        };

        const dirResult = normalizeWritablePath(directory);
        if (!dirResult.valid || !dirResult.normalized) {
          auditDenied(ctx, "upload_server_file", args, dirResult.reason ?? "Invalid path", server_id);
          return errorResult(dirResult.reason ?? "Invalid path");
        }

        const byteLength = new TextEncoder().encode(content).length;
        if (byteLength > ctx.config.fileMaxWriteBytes) {
          auditDenied(ctx, "upload_server_file", args, "Content exceeds max write size", server_id);
          return errorResult(`Content exceeds maximum size of ${ctx.config.fileMaxWriteBytes} bytes.`);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "file.create", "upload_server_file");
          await ctx.auth.client.uploadFile(server_id, dirResult.normalized, filename, content);
          auditSuccess(ctx, "upload_server_file", args, server_id);
          return textResult({
            ok: true,
            serverId: server_id,
            directory: dirResult.normalized,
            filename,
            byteLength,
          });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "upload_server_file", args, message, server_id);
          return errorResult(message);
        }
      },
    );

    server.tool(
      "create_server_folder",
      "Create a directory on the server. Requires file.create permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        root: z.string().default("/").describe("Parent directory path"),
        name: z.string().min(1).describe("Folder name to create"),
      },
      async ({ server_id, root, name }) => {
        checkRateLimit(ctx, "create_server_folder");
        const args = { server_id, root, name };

        const rootResult = normalizeWritablePath(root);
        if (!rootResult.valid || !rootResult.normalized) {
          auditDenied(ctx, "create_server_folder", args, rootResult.reason ?? "Invalid path", server_id);
          return errorResult(rootResult.reason ?? "Invalid path");
        }

        try {
          await requireServerWithPermission(ctx, server_id, "file.create", "create_server_folder");
          await ctx.auth.client.createFolder(server_id, rootResult.normalized, name);
          auditSuccess(ctx, "create_server_folder", args, server_id);
          return textResult({
            ok: true,
            serverId: server_id,
            path: `${rootResult.normalized}/${name}`.replace(/\/+/g, "/"),
          });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "create_server_folder", args, message, server_id);
          return errorResult(message);
        }
      },
    );

    server.tool(
      "delete_server_files",
      "Delete files or directories. Requires confirmation and file.delete permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        root: z.string().default("/").describe("Base directory for file names"),
        files: z.array(z.string().min(1)).min(1).describe("File or folder names relative to root"),
        confirmation_token: z
          .string()
          .optional()
          .describe("Token from a prior call that returned requires_confirmation"),
      },
      async ({ server_id, root, files, confirmation_token }) => {
        checkRateLimit(ctx, "delete_server_files");
        const args = {
          server_id,
          root,
          files,
          confirmation_token: confirmation_token ? "[redacted]" : undefined,
        };

        const rootResult = normalizeWritablePath(root);
        if (!rootResult.valid || !rootResult.normalized) {
          auditDenied(ctx, "delete_server_files", args, rootResult.reason ?? "Invalid path", server_id);
          return errorResult(rootResult.reason ?? "Invalid path");
        }

        const fingerprint = ActionConfirmationStore.fingerprint(
          "delete_files",
          server_id,
          `${rootResult.normalized}:${files.join(",")}`,
        );

        if (!confirmation_token) {
          try {
            await requireServerWithPermission(ctx, server_id, "file.delete", "delete_server_files");
          } catch (error) {
            const message = formatPterodactylError(error);
            auditDenied(ctx, "delete_server_files", args, message, server_id);
            return errorResult(message);
          }
          const pending = ctx.actionConfirmationStore.create(
            ctx.auth.account.id,
            server_id,
            "delete_files",
            fingerprint,
          );
          auditSuccess(ctx, "delete_server_files", { ...args, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            server_id,
            root: rootResult.normalized,
            files,
            message: "File deletion requires confirmation. Call again with confirmation_token.",
          });
        }

        const confirmed = ctx.actionConfirmationStore.consume(
          confirmation_token,
          ctx.auth.account.id,
          server_id,
          "delete_files",
          fingerprint,
        );
        if (!confirmed.ok) {
          auditDenied(ctx, "delete_server_files", args, confirmed.reason, server_id);
          return errorResult(confirmed.reason);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "file.delete", "delete_server_files");
          await ctx.auth.client.deleteFiles(server_id, rootResult.normalized, files);
          auditSuccess(ctx, "delete_server_files", args, server_id);
          return textResult({ ok: true, serverId: server_id, root: rootResult.normalized, files });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "delete_server_files", args, message, server_id);
          return errorResult(message);
        }
      },
    );

    server.tool(
      "rename_server_files",
      "Rename or move files within a directory. Requires file.update permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        root: z.string().default("/").describe("Base directory for operations"),
        operations: z
          .array(
            z.object({
              from: z.string().min(1).describe("Current file name relative to root"),
              to: z.string().min(1).describe("New file name relative to root"),
            }),
          )
          .min(1)
          .describe("Rename operations"),
      },
      async ({ server_id, root, operations }) => {
        checkRateLimit(ctx, "rename_server_files");
        const args = { server_id, root, operations };

        const rootResult = normalizeWritablePath(root);
        if (!rootResult.valid || !rootResult.normalized) {
          auditDenied(ctx, "rename_server_files", args, rootResult.reason ?? "Invalid path", server_id);
          return errorResult(rootResult.reason ?? "Invalid path");
        }

        try {
          await requireServerWithPermission(ctx, server_id, "file.update", "rename_server_files");
          await ctx.auth.client.renameFiles(server_id, rootResult.normalized, operations);
          auditSuccess(ctx, "rename_server_files", args, server_id);
          return textResult({ ok: true, serverId: server_id, root: rootResult.normalized, operations });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "rename_server_files", args, message, server_id);
          return errorResult(message);
        }
      },
    );

    server.tool(
      "pull_remote_file",
      "Download a file from a remote URL into the server. Requires file.create permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        url: z.string().url().describe("Remote URL to download from"),
        directory: z.string().default("/").describe("Target directory on the server"),
        filename: z.string().optional().describe("Custom filename (uses URL filename if omitted)"),
      },
      async ({ server_id, url, directory, filename }) => {
        checkRateLimit(ctx, "pull_remote_file");
        const args = { server_id, url, directory, filename };

        const dirResult = normalizeWritablePath(directory);
        if (!dirResult.valid || !dirResult.normalized) {
          auditDenied(ctx, "pull_remote_file", args, dirResult.reason ?? "Invalid path", server_id);
          return errorResult(dirResult.reason ?? "Invalid path");
        }

        try {
          await requireServerWithPermission(ctx, server_id, "file.create", "pull_remote_file");
          await ctx.auth.client.pullRemoteFile(server_id, {
            url,
            directory: dirResult.normalized,
            filename,
          });
          auditSuccess(ctx, "pull_remote_file", args, server_id);
          return textResult({
            ok: true,
            serverId: server_id,
            directory: dirResult.normalized,
            url,
            message: "Remote file pull started (may complete in background).",
          });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "pull_remote_file", args, message, server_id);
          return errorResult(message);
        }
      },
    );
  }

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
