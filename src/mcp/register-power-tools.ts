import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  POWER_PERMISSIONS,
  requiresPowerConfirmation,
  type PowerSignal,
} from "../power/confirmation-store.js";
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

const powerSignalSchema = z.enum(["start", "stop", "restart", "kill"]);

export function registerPowerTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "server_power",
    "Change a server's power state. Destructive actions (stop, restart, kill) require confirmation unless POWER_AUTO_CONFIRM is enabled.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      signal: powerSignalSchema.describe("Power action: start, stop, restart, or kill"),
      confirmation_token: z
        .string()
        .optional()
        .describe("Token from a prior server_power call that returned requires_confirmation"),
    },
    async ({ server_id, signal, confirmation_token }) => {
      checkRateLimit(ctx, "server_power");
      const args = { server_id, signal, confirmation_token: confirmation_token ? "[redacted]" : undefined };

      const permission = POWER_PERMISSIONS[signal as PowerSignal];
      try {
        const serverDetails = await requireServerWithPermission(
          ctx,
          server_id,
          permission,
          "server_power",
        );

        if (serverDetails.isInstalling) {
          auditDenied(ctx, "server_power", args, "Server is still installing", server_id);
          return errorResult("Server is still installing.");
        }

        const needsConfirmation = requiresPowerConfirmation(
          signal as PowerSignal,
          ctx.config.powerAutoConfirm,
        );

        if (needsConfirmation && !confirmation_token) {
          const pending = ctx.confirmationStore.create(
            ctx.auth.account.id,
            server_id,
            signal as PowerSignal,
          );
          auditSuccess(ctx, "server_power", { server_id, signal, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            expires_in_seconds: Math.floor((pending.expiresAt - Date.now()) / 1000),
            server_id,
            signal,
            message: `Power action "${signal}" requires confirmation. Call server_power again with confirmation_token within ${Math.floor(ctx.config.powerConfirmationTtlMs / 1000)} seconds.`,
          });
        }

        if (needsConfirmation && confirmation_token) {
          const result = ctx.confirmationStore.consume(
            confirmation_token,
            ctx.auth.account.id,
            server_id,
            signal as PowerSignal,
          );
          if (!result.ok) {
            auditDenied(ctx, "server_power", args, result.reason, server_id);
            return errorResult(result.reason);
          }
        }

        await ctx.auth.client.sendPowerAction(server_id, signal as PowerSignal);
        auditSuccess(ctx, "server_power", { server_id, signal, confirmed: needsConfirmation }, server_id);
        return textResult({
          ok: true,
          serverId: server_id,
          signal,
          message: `Power action "${signal}" sent successfully.`,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "server_power", args, message, server_id);
        return errorResult(message);
      }
    },
  );
}
