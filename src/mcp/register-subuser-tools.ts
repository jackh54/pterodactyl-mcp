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

export function registerSubuserTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "list_server_subusers",
    "List subusers who have access to a server. Requires user.read permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "list_server_subusers");
      const args = { server_id };
      try {
        await requireServerWithPermission(ctx, server_id, "user.read", "list_server_subusers");
        const subusers = await ctx.auth.client.listSubusers(server_id);
        auditSuccess(ctx, "list_server_subusers", args, server_id);
        return textResult({ serverId: server_id, count: subusers.length, subusers });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "list_server_subusers", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "get_server_subuser",
    "Get details and permissions for a specific subuser. Requires user.read permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      user_uuid: z.string().min(8).describe("Subuser UUID"),
    },
    async ({ server_id, user_uuid }) => {
      checkRateLimit(ctx, "get_server_subuser");
      const args = { server_id, user_uuid };
      try {
        await requireServerWithPermission(ctx, server_id, "user.read", "get_server_subuser");
        const subuser = await ctx.auth.client.getSubuser(server_id, user_uuid);
        auditSuccess(ctx, "get_server_subuser", args, server_id);
        return textResult({ serverId: server_id, subuser });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "get_server_subuser", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "create_server_subuser",
    "Add a subuser to a server with specified permissions. Requires user.create permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      email: z.string().email().describe("Email address of the user to add"),
      permissions: z
        .array(z.string())
        .min(1)
        .describe("Permission strings (e.g. control.console, file.read)"),
    },
    async ({ server_id, email, permissions }) => {
      checkRateLimit(ctx, "create_server_subuser");
      const args = { server_id, email, permissions };
      try {
        await requireServerWithPermission(ctx, server_id, "user.create", "create_server_subuser");
        const subuser = await ctx.auth.client.createSubuser(server_id, email, permissions);
        auditSuccess(ctx, "create_server_subuser", args, server_id);
        return textResult({ ok: true, serverId: server_id, subuser });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "create_server_subuser", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "update_server_subuser",
    "Update permissions for an existing subuser. Requires user.update permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      user_uuid: z.string().min(8).describe("Subuser UUID"),
      permissions: z
        .array(z.string())
        .min(1)
        .describe("Updated permission strings"),
    },
    async ({ server_id, user_uuid, permissions }) => {
      checkRateLimit(ctx, "update_server_subuser");
      const args = { server_id, user_uuid, permissions };
      try {
        await requireServerWithPermission(ctx, server_id, "user.update", "update_server_subuser");
        const subuser = await ctx.auth.client.updateSubuser(server_id, user_uuid, permissions);
        auditSuccess(ctx, "update_server_subuser", args, server_id);
        return textResult({ ok: true, serverId: server_id, subuser });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "update_server_subuser", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  if (ctx.config.enableFileMutations) {
    server.tool(
      "delete_server_subuser",
      "Remove a subuser from a server. Requires confirmation and user.delete permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        user_uuid: z.string().min(8).describe("Subuser UUID to remove"),
        confirmation_token: z
          .string()
          .optional()
          .describe("Token from a prior call that returned requires_confirmation"),
      },
      async ({ server_id, user_uuid, confirmation_token }) => {
        checkRateLimit(ctx, "delete_server_subuser");
        const args = {
          server_id,
          user_uuid,
          confirmation_token: confirmation_token ? "[redacted]" : undefined,
        };
        const fingerprint = ActionConfirmationStore.fingerprint(
          "delete_subuser",
          server_id,
          user_uuid,
        );

        if (!confirmation_token) {
          try {
            await requireServerWithPermission(ctx, server_id, "user.delete", "delete_server_subuser");
          } catch (error) {
            const message = formatPterodactylError(error);
            auditDenied(ctx, "delete_server_subuser", args, message, server_id);
            return errorResult(message);
          }
          const pending = ctx.actionConfirmationStore.create(
            ctx.auth.account.id,
            server_id,
            "delete_subuser",
            fingerprint,
          );
          auditSuccess(ctx, "delete_server_subuser", { ...args, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            server_id,
            user_uuid,
            message: "Subuser deletion requires confirmation. Call again with confirmation_token.",
          });
        }

        const confirmed = ctx.actionConfirmationStore.consume(
          confirmation_token,
          ctx.auth.account.id,
          server_id,
          "delete_subuser",
          fingerprint,
        );
        if (!confirmed.ok) {
          auditDenied(ctx, "delete_server_subuser", args, confirmed.reason, server_id);
          return errorResult(confirmed.reason);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "user.delete", "delete_server_subuser");
          await ctx.auth.client.deleteSubuser(server_id, user_uuid);
          auditSuccess(ctx, "delete_server_subuser", args, server_id);
          return textResult({ ok: true, serverId: server_id, userUuid: user_uuid });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "delete_server_subuser", args, message, server_id);
          return errorResult(message);
        }
      },
    );
  }
}
