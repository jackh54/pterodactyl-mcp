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
  textResult,
} from "./helpers.js";
import type { McpContext } from "./context.js";

export function registerAdminTools(server: McpServer, ctx: McpContext): void {
  if (!ctx.config.enableApplicationApi || !ctx.applicationClient) {
    return;
  }

  server.tool(
    "create_server",
    "Provision a new server via the Application API. Requires ENABLE_APPLICATION_API=true and admin API key. Requires confirmation.",
    {
      name: z.string().min(1).describe("Server display name"),
      user: z.number().int().describe("Panel user ID who will own the server"),
      egg: z.number().int().describe("Egg ID"),
      docker_image: z.string().min(1).describe("Docker image"),
      startup: z.string().min(1).describe("Startup command"),
      environment: z.record(z.string(), z.string()).describe("Egg environment variables"),
      memory: z.number().int().min(128).describe("Memory limit in MB"),
      disk: z.number().int().min(512).describe("Disk limit in MB"),
      cpu: z.number().int().min(0).describe("CPU limit percentage (0 = unlimited)"),
      swap: z.number().int().default(0).describe("Swap in MB"),
      io: z.number().int().min(10).max(1000).default(500).describe("IO weight"),
      databases: z.number().int().min(0).default(1).describe("Database limit"),
      allocations: z.number().int().min(0).default(1).describe("Allocation limit"),
      backups: z.number().int().min(0).default(3).describe("Backup limit"),
      allocation_default: z.number().int().optional().describe("Primary allocation ID"),
      deploy_locations: z
        .array(z.number().int())
        .optional()
        .describe("Location IDs for auto-deploy"),
      deploy_port_range: z
        .array(z.string())
        .optional()
        .describe("Port ranges for auto-deploy (e.g. ['25565-25570'])"),
      description: z.string().optional().describe("Server description"),
      start_on_completion: z.boolean().optional().describe("Start server after install"),
      confirmation_token: z
        .string()
        .optional()
        .describe("Token from a prior call that returned requires_confirmation"),
    },
    async (params) => {
      checkRateLimit(ctx, "create_server");
      const {
        confirmation_token,
        docker_image,
        start_on_completion,
        allocation_default,
        deploy_locations,
        deploy_port_range,
        ...rest
      } = params;

      const args = {
        name: rest.name,
        user: rest.user,
        egg: rest.egg,
        confirmation_token: confirmation_token ? "[redacted]" : undefined,
      };

      const fingerprint = ActionConfirmationStore.fingerprint(
        "create_server",
        "admin",
        `${rest.name}:${rest.user}:${rest.egg}`,
      );

      if (!confirmation_token) {
        const pending = ctx.actionConfirmationStore.create(
          ctx.auth.account.id,
          "admin",
          "create_server",
          fingerprint,
        );
        auditSuccess(ctx, "create_server", { ...args, stage: "confirmation_requested" });
        return textResult({
          requires_confirmation: true,
          confirmation_token: pending.token,
          expires_at: new Date(pending.expiresAt).toISOString(),
          name: rest.name,
          user: rest.user,
          egg: rest.egg,
          message: "Server creation requires confirmation. Call create_server again with confirmation_token.",
        });
      }

      const confirmed = ctx.actionConfirmationStore.consume(
        confirmation_token,
        ctx.auth.account.id,
        "admin",
        "create_server",
        fingerprint,
      );
      if (!confirmed.ok) {
        auditDenied(ctx, "create_server", args, confirmed.reason);
        return errorResult(confirmed.reason);
      }

      try {
        const server = await ctx.applicationClient!.createServer({
          name: rest.name,
          user: rest.user,
          egg: rest.egg,
          dockerImage: docker_image,
          startup: rest.startup,
          environment: rest.environment,
          limits: {
            memory: rest.memory,
            swap: rest.swap,
            disk: rest.disk,
            io: rest.io,
            cpu: rest.cpu,
          },
          featureLimits: {
            databases: rest.databases,
            allocations: rest.allocations,
            backups: rest.backups,
          },
          allocation: allocation_default ? { default: allocation_default } : undefined,
          deploy:
            deploy_locations && deploy_port_range
              ? {
                  locations: deploy_locations,
                  dedicatedIp: false,
                  portRange: deploy_port_range,
                }
              : undefined,
          description: rest.description,
          startOnCompletion: start_on_completion,
        });
        auditSuccess(ctx, "create_server", args);
        return textResult({ ok: true, server });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "create_server", args, message);
        return errorResult(message);
      }
    },
  );

  server.tool(
    "delete_server",
    "Delete a server via the Application API. Requires confirmation. Destructive and irreversible.",
    {
      server_id: z.string().min(8).describe("Server short identifier or UUID"),
      force: z.boolean().optional().describe("Force delete bypassing daemon checks"),
      confirmation_token: z
        .string()
        .optional()
        .describe("Token from a prior call that returned requires_confirmation"),
    },
    async ({ server_id, force, confirmation_token }) => {
      checkRateLimit(ctx, "delete_server");
      const args = {
        server_id,
        force,
        confirmation_token: confirmation_token ? "[redacted]" : undefined,
      };
      const fingerprint = ActionConfirmationStore.fingerprint("delete_server", server_id, "delete");

      if (!confirmation_token) {
        const pending = ctx.actionConfirmationStore.create(
          ctx.auth.account.id,
          server_id,
          "delete_server",
          fingerprint,
        );
        auditSuccess(ctx, "delete_server", { ...args, stage: "confirmation_requested" }, server_id);
        return textResult({
          requires_confirmation: true,
          confirmation_token: pending.token,
          expires_at: new Date(pending.expiresAt).toISOString(),
          server_id,
          message: "Server deletion requires confirmation. Call delete_server again with confirmation_token.",
        });
      }

      const confirmed = ctx.actionConfirmationStore.consume(
        confirmation_token,
        ctx.auth.account.id,
        server_id,
        "delete_server",
        fingerprint,
      );
      if (!confirmed.ok) {
        auditDenied(ctx, "delete_server", args, confirmed.reason, server_id);
        return errorResult(confirmed.reason);
      }

      try {
        const lookup = await ctx.applicationClient!.getServerByIdentifier(server_id);
        if (!lookup) {
          return errorResult(`Server not found: ${server_id}`);
        }
        await ctx.applicationClient!.deleteServer(lookup.id, force ?? false);
        auditSuccess(ctx, "delete_server", args, server_id);
        return textResult({ ok: true, serverId: server_id, internalId: lookup.id });
      } catch (error) {
        const message = formatPterodactylError(error);
        auditError(ctx, "delete_server", args, message, server_id);
        return errorResult(message);
      }
    },
  );
}
