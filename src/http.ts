import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { AuditLogger } from "./audit/logger.js";
import { RateLimiter } from "./rate-limit.js";
import { ConsoleSessionManager } from "./pterodactyl/console-session.js";
import { createIpAllowlistMiddleware, getClientIp } from "./auth/ip-allowlist.js";
import {
  authenticateRequest,
  extractBearerToken,
  sendUnauthorized,
} from "./auth/middleware.js";
import { mountOAuthRoutes, getRegisteredClientCount } from "./auth/oauth-routes.js";
import { ConfirmationStore } from "./power/confirmation-store.js";
import {
  ActionConfirmationStore,
  BackupRateLimiter,
} from "./confirmation/action-store.js";
import { MetricsRegistry } from "./metrics/registry.js";
import { createMcpServer } from "./mcp/create-server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

export function createApp(config: Config, metricsRegistry = new MetricsRegistry()): express.Application {
  const app = express();
  app.set("trust proxy", true);

  const audit = new AuditLogger(config.auditLogPath);
  const rateLimiter = new RateLimiter(config.rateLimitPerMinute);
  const consoleSessions = new ConsoleSessionManager(
    config.consoleSessionIdleMs,
    config.consoleMaxSessions,
    {
      handshakeTimeoutMs: config.consoleConnectTimeoutMs,
      authTimeoutMs: config.consoleAuthTimeoutMs,
      rejectUnauthorized: !config.wingsTlsInsecure,
      origin: config.wingsWebSocketOrigin,
    },
  );
  const confirmationStore = new ConfirmationStore(config.powerConfirmationTtlMs);
  const actionConfirmationStore = new ActionConfirmationStore(config.powerConfirmationTtlMs);
  const backupRateLimiter = new BackupRateLimiter(config.backupRateLimitMs);
  const sessions = new Map<string, SessionEntry>();
  const ipAllowlist = createIpAllowlistMiddleware(config.allowedIps);

  app.use(express.json({ limit: "2mb" }));

  mountOAuthRoutes(app, config);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      mcpEnabled: config.mcpEnabled,
      version: "0.4.0",
      commandPolicyMode: config.commandPolicyMode,
      commandPolicyPreset: config.commandPolicyPreset,
      policyAutoDetectEgg: config.policyAutoDetectEgg,
      powerAutoConfirm: config.powerAutoConfirm,
      enableFileWrite: config.enableFileWrite,
      enableBackups: config.enableBackups,
      ipAllowlistEnabled: Boolean(config.allowedIps?.length),
      metricsEnabled: config.metricsEnabled,
      oauthClientsRegistered: getRegisteredClientCount(),
    });
  });

  if (config.metricsEnabled) {
    app.get("/metrics", (_req, res) => {
      metricsRegistry.setActiveSessions(sessions.size);
      metricsRegistry.setGauge(
        "pterodactyl_mcp_info",
        1,
        { version: "0.4.0" },
      );
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.send(metricsRegistry.toPrometheus());
    });
  }

  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const baseUrl = `${req.protocol}://${req.headers.host ?? "localhost"}`;
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [`${baseUrl}`],
      scopes_supported: [
        "servers:read",
        "server:console:read",
        "server:console:write",
        "server:power",
        "server:files:read",
        "server:files:write",
        "server:backups",
      ],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://github.com/jackh54/pterodactyl-mcp",
    });
  });

  app.use("/mcp", (req, res, next) => {
    if (!config.mcpEnabled) {
      res.status(503).json({
        error: "service_unavailable",
        message: "MCP server is disabled by administrator (MCP_ENABLED=false).",
      });
      return;
    }
    next();
  });

  app.use("/mcp", ipAllowlist);

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let entry: SessionEntry | undefined;

      if (sessionId && sessions.has(sessionId)) {
        entry = sessions.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const token = extractBearerToken(req);
        if (!token) {
          sendUnauthorized(res);
          return;
        }

        const auth = await authenticateRequest(config, token);
        const clientIp = getClientIp(req);

        const server = createMcpServer({
          auth,
          audit,
          rateLimiter,
          config,
          clientIp,
          consoleSessions,
          confirmationStore,
          actionConfirmationStore,
          backupRateLimiter,
          metrics: metricsRegistry,
        });

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: Boolean(config.allowedHosts?.length),
          allowedHosts: config.allowedHosts,
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, server });
            metricsRegistry.setActiveSessions(sessions.size);
          },
        });

        entry = { transport, server };

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
            metricsRegistry.setActiveSessions(sessions.size);
          }
        };

        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      if (!entry) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid MCP session" },
          id: null,
        });
        return;
      }

      await entry.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", ipAllowlist, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const entry = sessions.get(sessionId)!;
    await entry.transport.handleRequest(req, res);
  });

  app.delete("/mcp", ipAllowlist, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const entry = sessions.get(sessionId)!;
    await entry.transport.handleRequest(req, res);
  });

  app.use(
    (
      err: Error,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      console.error("Unhandled error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_server_error", message: err.message });
      }
    },
  );

  return app;
}

export function startServer(config: Config): void {
  const app = createApp(config);
  app.listen(config.port, config.host, () => {
    console.log(
      `pterodactyl-mcp listening on http://${config.host}:${config.port}`,
    );
    console.log(`MCP endpoint: http://${config.host}:${config.port}/mcp`);
    console.log(`Panel URL: ${config.panelUrl}`);
    console.log(`MCP enabled: ${config.mcpEnabled}`);
    console.log(
      `Command policy: ${config.commandPolicyMode} (preset: ${config.commandPolicyPreset}, auto-detect: ${config.policyAutoDetectEgg})`,
    );
    if (config.allowedIps?.length) {
      console.log(`IP allowlist: ${config.allowedIps.join(", ")}`);
    }
    if (config.metricsEnabled) {
      console.log(`Metrics: http://${config.host}:${config.port}/metrics`);
    }
  });
}
