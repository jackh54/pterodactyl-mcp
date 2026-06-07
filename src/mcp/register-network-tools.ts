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

export function registerNetworkTools(server: McpServer, ctx: McpContext): void {
  server.tool(
    "list_server_allocations",
    "List network allocations (IP addresses and ports) assigned to a server. Requires allocation.read permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "list_server_allocations");
      const args = { server_id };
      try {
        await requireServerWithPermission(ctx, server_id, "allocation.read", "list_server_allocations");
        const allocations = await ctx.auth.client.listAllocations(server_id);
        auditSuccess(ctx, "list_server_allocations", args, server_id);
        return textResult({
          serverId: server_id,
          count: allocations.length,
          allocations,
          primary: allocations.find((a) => a.isDefault) ?? null,
        });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "list_server_allocations", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "create_server_allocation",
    "Assign a new network allocation (port) to a server. Requires allocation.create permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
    },
    async ({ server_id }) => {
      checkRateLimit(ctx, "create_server_allocation");
      const args = { server_id };
      try {
        await requireServerWithPermission(ctx, server_id, "allocation.create", "create_server_allocation");
        const allocation = await ctx.auth.client.createAllocation(server_id);
        auditSuccess(ctx, "create_server_allocation", args, server_id);
        return textResult({ ok: true, serverId: server_id, allocation });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "create_server_allocation", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "update_server_allocation",
    "Update allocation notes or set primary allocation. Requires allocation.update permission.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      allocation_id: z.number().int().describe("Allocation ID"),
      notes: z.string().optional().describe("Notes for this allocation"),
      set_primary: z.boolean().optional().describe("Set this allocation as the primary/default"),
    },
    async ({ server_id, allocation_id, notes, set_primary }) => {
      checkRateLimit(ctx, "update_server_allocation");
      const args = { server_id, allocation_id, notes, set_primary };
      try {
        await requireServerWithPermission(ctx, server_id, "allocation.update", "update_server_allocation");
        const allocation = set_primary
          ? await ctx.auth.client.setPrimaryAllocation(server_id, allocation_id)
          : await ctx.auth.client.updateAllocationNotes(server_id, allocation_id, notes ?? "");
        auditSuccess(ctx, "update_server_allocation", args, server_id);
        return textResult({ ok: true, serverId: server_id, allocation });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "update_server_allocation", args, message, server_id);
        return errorResult(message);
      }
    },
  );

  if (ctx.config.enableFileMutations) {
    server.tool(
      "delete_server_allocation",
      "Remove a network allocation from a server. Requires confirmation and allocation.delete permission.",
      {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        allocation_id: z.number().int().describe("Allocation ID to delete"),
        confirmation_token: z
          .string()
          .optional()
          .describe("Token from a prior call that returned requires_confirmation"),
      },
      async ({ server_id, allocation_id, confirmation_token }) => {
        checkRateLimit(ctx, "delete_server_allocation");
        const args = {
          server_id,
          allocation_id,
          confirmation_token: confirmation_token ? "[redacted]" : undefined,
        };
        const fingerprint = ActionConfirmationStore.fingerprint(
          "delete_allocation",
          server_id,
          String(allocation_id),
        );

        if (!confirmation_token) {
          try {
            await requireServerWithPermission(ctx, server_id, "allocation.delete", "delete_server_allocation");
          } catch (error) {
            const message = formatPterodactylError(error);
            auditDenied(ctx, "delete_server_allocation", args, message, server_id);
            return errorResult(message);
          }
          const pending = ctx.actionConfirmationStore.create(
            ctx.auth.account.id,
            server_id,
            "delete_allocation",
            fingerprint,
          );
          auditSuccess(ctx, "delete_server_allocation", { ...args, stage: "confirmation_requested" }, server_id);
          return textResult({
            requires_confirmation: true,
            confirmation_token: pending.token,
            expires_at: new Date(pending.expiresAt).toISOString(),
            server_id,
            allocation_id,
            message: "Allocation deletion requires confirmation. Call again with confirmation_token.",
          });
        }

        const confirmed = ctx.actionConfirmationStore.consume(
          confirmation_token,
          ctx.auth.account.id,
          server_id,
          "delete_allocation",
          fingerprint,
        );
        if (!confirmed.ok) {
          auditDenied(ctx, "delete_server_allocation", args, confirmed.reason, server_id);
          return errorResult(confirmed.reason);
        }

        try {
          await requireServerWithPermission(ctx, server_id, "allocation.delete", "delete_server_allocation");
          await ctx.auth.client.deleteAllocation(server_id, allocation_id);
          auditSuccess(ctx, "delete_server_allocation", args, server_id);
          return textResult({ ok: true, serverId: server_id, allocationId: allocation_id });
        } catch (error) {
          const message = formatPterodactylError(error);
          auditError(ctx, "delete_server_allocation", args, message, server_id);
          return errorResult(message);
        }
      },
    );
  }
}
