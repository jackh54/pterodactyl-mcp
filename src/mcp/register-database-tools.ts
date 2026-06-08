import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ActionConfirmationStore } from "../confirmation/action-store.js";
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

export function registerDatabaseTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "list_server_databases",
    "List MySQL/MariaDB databases for a server. Requires database.read permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "list_server_databases");
      const args = { server_id };
      try {
        await requireServerWithPermission(ctx, server_id, "database.read", "list_server_databases");
        const databases = await ctx.auth.client.listDatabases(server_id);
        auditSuccess(ctx, "list_server_databases", args, server_id);
        return textResult({ serverId: server_id, count: databases.length, databases });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "list_server_databases", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "create_server_database",
    "Create a new database for a server. Password is returned once. Requires database.create permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      database: z.string().min(1).max(48).describe("Database name (will be prefixed by the panel)"),
      remote: z
        .string()
        .default("%")
        .describe("Allowed remote host (% for any, or specific IP)"),
    },
    async ({ server_id, database, remote }) => {
      checkRateLimit(ctx, "create_server_database");
      const args = { server_id, database, remote };
      try {
        await requireServerWithPermission(ctx, server_id, "database.create", "create_server_database");
        const created = await ctx.auth.client.createDatabase(server_id, database, remote);
        auditSuccess(ctx, "create_server_database", args, server_id);
        return textResult({
          ok: true,
          serverId: server_id,
          database: created,
          message: "Store the password securely — it cannot be retrieved again, only rotated.",
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "create_server_database", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "rotate_server_database_password",
    "Generate a new password for a database. Requires database.update permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      database_id: z.string().min(1).describe("Database ID from list_server_databases"),
    },
    async ({ server_id, database_id }) => {
      checkRateLimit(ctx, "rotate_server_database_password");
      const args = { server_id, database_id };
      try {
        await requireServerWithPermission(ctx, server_id, "database.update", "rotate_server_database_password");
        const database = await ctx.auth.client.rotateDatabasePassword(server_id, database_id);
        auditSuccess(ctx, "rotate_server_database_password", args, server_id);
        return textResult({
          ok: true,
          serverId: server_id,
          database,
          message: "Password rotated. Update your application configuration immediately.",
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "rotate_server_database_password", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  if (ctx.config.enableFileMutations) {
    server.tool(
      "delete_server_database",
      "Delete a database and its user. Requires confirmation and database.delete permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        database_id: z.string().min(1).describe("Database ID to delete"),
        confirmation_token: z
          .string()
          .optional()
          .describe("Token from a prior call that returned requires_confirmation"),
      },
      async ({ server_id, database_id, confirmation_token }) => {
        checkRateLimit(ctx, "delete_server_database");
        const args = {
          server_id,
          database_id,
          confirmation_token: confirmation_token ? "[redacted]" : undefined,
        };
        const fingerprint = ActionConfirmationStore.fingerprint(
          "delete_database",
          server_id,
          database_id,
        );

        if (!confirmation_token) {
          try {
            await requireServerWithPermission(ctx, server_id, "database.delete", "delete_server_database");
          } catch (error) {
            const message = formatPterodactylError(error);
            auditDenied(ctx, "delete_server_database", args, message, server_id);
            return errorResult(message);
          }
          const pending = ctx.actionConfirmationStore.create(
            ctx.auth.account.id,
            server_id,
            "delete_database",
            fingerprint,
          );
          auditSuccess(ctx, "delete_server_database", { ...args, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            server_id,
            database_id,
            message: "Database deletion requires confirmation. Call again with confirmation_token.",
          });
        }

        const confirmed = ctx.actionConfirmationStore.consume(
          confirmation_token,
          ctx.auth.account.id,
          server_id,
          "delete_database",
          fingerprint,
        );
        if (!confirmed.ok) {
          auditDenied(ctx, "delete_server_database", args, confirmed.reason, server_id);
          return errorResult(confirmed.reason);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "database.delete", "delete_server_database");
          await ctx.auth.client.deleteDatabase(server_id, database_id);
          auditSuccess(ctx, "delete_server_database", args, server_id);
          return textResult({ ok: true, serverId: server_id, databaseId: database_id });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "delete_server_database", args, message, server_id);
          return errorResult(message);
        }
      },
    );
  }
}
