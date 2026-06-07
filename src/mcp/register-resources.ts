import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "./context.js";
import { requireServerWithConsole } from "./helpers.js";

export function registerResources(server: McpServer, ctx: McpContext): void {
  server.registerResource(
    "server-status",
    new ResourceTemplate("server://{server_id}/status", {
      list: async () => {
        const servers = await ctx.auth.client.listServers();
        return {
          resources: servers.map((s) => ({
            uri: `server://${s.identifier}/status`,
            name: `${s.name} status`,
            description: `Live status for ${s.name}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      description: "Current server metadata, permissions, and resource usage",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const serverId = String(variables.server_id);
      await requireServerWithConsole(ctx, serverId, "resource:server-status");
      const [server, resources] = await Promise.all([
        ctx.auth.client.getServer(serverId),
        ctx.auth.client.getServerResources(serverId),
      ]);

      const payload = {
        serverId,
        name: server.name,
        node: server.node,
        status: server.status,
        isSuspended: server.isSuspended,
        isInstalling: server.isInstalling,
        permissions: server.userPermissions,
        resources,
        fetchedAt: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "server-list",
    "server://list",
    {
      description: "All servers accessible to the authenticated user",
      mimeType: "application/json",
    },
    async (uri) => {
      const servers = await ctx.auth.client.listServers();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ servers, count: servers.length }, null, 2),
          },
        ],
      };
    },
  );
}
