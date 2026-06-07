import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpContext } from "./context.js";
import { formatPterodactylError, requireServerWithConsole } from "./helpers.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function registerPrompts(server: McpServer, ctx: McpContext): void {
  server.registerPrompt(
    "diagnose_server",
    {
      description:
        "Structured troubleshooting workflow for a Pterodactyl game server — checks status, resources, and recent console output.",
      argsSchema: {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
      },
    },
    async ({ server_id }) => {
      const server = await requireServerWithConsole(ctx, server_id, "prompt:diagnose_server");
      const resources = await ctx.auth.client.getServerResources(server_id);

      let recentLogs: string[] = [];
      if (resources.currentState === "running" && !server.isSuspended) {
        try {
          const credentials = await ctx.auth.client.getWebSocketCredentials(server_id);
          recentLogs = await ctx.consoleSessions.withSession(
            `${ctx.auth.tokenFingerprint}:${server_id}`,
            server_id,
            credentials,
            (session) =>
              session.fetchRecentOutput({
                maxLines: 30,
                timeoutMs: ctx.config.consoleTimeoutMs,
              }),
          );
        } catch (error) {
          recentLogs = [`(Could not fetch console output: ${formatPterodactylError(error)})`];
        }
      }

      const memoryLimitMb = server.limits.memory;
      const memoryUsedMb = resources.memoryBytes / (1024 * 1024);
      const memoryPct = memoryLimitMb > 0 ? ((memoryUsedMb / memoryLimitMb) * 100).toFixed(1) : "n/a";
      const diskLimitMb = server.limits.disk;
      const diskUsedMb = resources.diskBytes / (1024 * 1024);
      const diskPct = diskLimitMb > 0 ? ((diskUsedMb / diskLimitMb) * 100).toFixed(1) : "n/a";

      const findings: string[] = [];
      if (server.isSuspended) findings.push("Server is suspended.");
      if (server.isInstalling) findings.push("Server is still installing.");
      if (resources.currentState === "offline") findings.push("Server process is offline.");
      if (resources.currentState === "starting") findings.push("Server is currently starting.");
      if (parseFloat(memoryPct) > 90) findings.push("Memory usage is above 90% of limit.");
      if (parseFloat(diskPct) > 90) findings.push("Disk usage is above 90% of limit.");

      const logText =
        recentLogs.length > 0
          ? recentLogs.slice(-20).join("\n")
          : "(No recent console output available — server may be offline.)";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Diagnose Pterodactyl server "${server.name}" (${server_id}).`,
                "",
                "## Current state",
                `- Power state: ${resources.currentState}`,
                `- Suspended: ${server.isSuspended}`,
                `- Installing: ${server.isInstalling}`,
                `- Node: ${server.node}`,
                `- Uptime: ${formatUptime(resources.uptime)}`,
                "",
                "## Resources",
                `- CPU: ${resources.cpuAbsolute.toFixed(1)}%`,
                `- Memory: ${formatBytes(resources.memoryBytes)} / ${memoryLimitMb} MB (${memoryPct}%)`,
                `- Disk: ${formatBytes(resources.diskBytes)} / ${diskLimitMb} MB (${diskPct}%)`,
                "",
                findings.length > 0
                  ? `## Initial findings\n${findings.map((f) => `- ${f}`).join("\n")}`
                  : "## Initial findings\n- No immediate issues detected from status metrics.",
                "",
                "## Recent console output (last 20 lines)",
                "```",
                logText,
                "```",
                "",
                "## Your task",
                "1. Summarize the server health based on the data above.",
                "2. Identify likely root causes if the server is unhealthy.",
                "3. Suggest specific next steps (safe console commands, config checks, or panel actions).",
                "4. Do NOT run destructive commands without explicit user confirmation.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "safe_restart",
    {
      description:
        "Guides a safe server restart: check status, warn players if possible, restart with confirmation.",
      argsSchema: {
        server_id: z.string().min(8).describe("Server short identifier or UUID"),
        warning_message: z
          .string()
          .optional()
          .describe("Optional in-game warning message before restart"),
      },
    },
    async ({ server_id, warning_message }) => {
      const server = await requireServerWithConsole(ctx, server_id, "prompt:safe_restart");
      const resources = await ctx.auth.client.getServerResources(server_id);

      const canPower = ctx.auth.client.hasPermission(server, "control.restart");
      const canConsole = ctx.auth.client.hasPermission(server, "control.console");

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Perform a safe restart of Pterodactyl server "${server.name}" (${server_id}).`,
                "",
                "## Current state",
                `- Power state: ${resources.currentState}`,
                `- Can restart: ${canPower}`,
                `- Can send console commands: ${canConsole}`,
                "",
                "## Procedure",
                "1. Confirm with the user that a restart is intended.",
                "2. If the server is running and console access is available:",
                warning_message
                  ? `   - Send warning: \`${warning_message}\``
                  : "   - Send a warning message to players (e.g. `say Server restarting in 30 seconds!`)",
                "   - Wait an appropriate interval before restarting.",
                "3. Use `server_power` with signal `restart`:",
                "   - First call WITHOUT confirmation_token to obtain a token.",
                "   - Second call WITH the confirmation_token to execute.",
                "4. After restart, use `get_server_resources` and `get_console_output` to verify the server came back healthy.",
                "",
                "## Constraints",
                "- Do NOT skip user confirmation for the restart.",
                "- Do NOT use `kill` unless `restart` fails and the user explicitly approves.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
