import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { AuditLogger } from "./audit/logger.js";
import { RateLimiter } from "./rate-limit.js";
import {
  authenticateRequest,
  extractBearerToken,
  sendUnauthorized,
  type AuthContext,
} from "./auth/middleware.js";
import { createMcpServer } from "./tools/register-tools.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  auth: AuthContext;
}

export function createApp(config: Config): express.Application {
  const app = express();
  const audit = new AuditLogger(config.auditLogPath);
  const rateLimiter = new RateLimiter(config.rateLimitPerMinute);
  const sessions = new Map<string, SessionEntry>();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      mcpEnabled: config.mcpEnabled,
      version: "0.1.0",
    });
  });

  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const baseUrl = `${req.protocol}://${req.headers.host ?? "localhost"}`;
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [`${baseUrl}/oauth`],
      scopes_supported: [
        "servers:read",
        "server:console:read",
        "server:console:write",
        "server:power",
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
        const clientIp = req.ip;

        const server = createMcpServer({
          auth,
          audit,
          rateLimiter,
          clientIp,
        });

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: Boolean(config.allowedHosts?.length),
          allowedHosts: config.allowedHosts,
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, server, auth });
          },
        });

        entry = { transport, server, auth };

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
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

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const entry = sessions.get(sessionId)!;
    await entry.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
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
  });
}
