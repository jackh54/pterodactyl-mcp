import { createHash, randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import type { Config } from "../config.js";

interface RegisteredClient {
  clientId: string;
  clientSecretHash: string;
  clientName: string;
  redirectUris: string[];
  createdAt: string;
}

const registeredClients = new Map<string, RegisteredClient>();

export function mountOAuthRoutes(app: express.Application, config: Config): void {
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const baseUrl = `${req.protocol}://${req.headers.host ?? "localhost"}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      scopes_supported: [
        "servers:read",
        "server:console:read",
        "server:console:write",
        "server:power",
        "server:files:read",
        "server:files:write",
        "server:backups",
      ],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  app.post("/oauth/register", express.json(), (req: Request, res: Response) => {
    if (!config.mcpAdminSecret) {
      res.status(501).json({
        error: "not_implemented",
        message: "Dynamic client registration requires MCP_ADMIN_SECRET to be configured.",
      });
      return;
    }

    const adminToken = extractAdminBearer(req);
    if (adminToken !== config.mcpAdminSecret) {
      res.status(401).json({ error: "unauthorized", message: "Invalid admin credentials" });
      return;
    }

    const clientName = String(req.body?.client_name ?? "MCP Client");
    const redirectUris = Array.isArray(req.body?.redirect_uris)
      ? req.body.redirect_uris.map(String)
      : [];

    const clientId = `mcp_${randomUUID().replace(/-/g, "")}`;
    const clientSecret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

    registeredClients.set(clientId, {
      clientId,
      clientSecretHash: hashClientSecret(clientSecret),
      clientName,
      redirectUris,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  app.get("/oauth/authorize", (_req, res) => {
    res.status(501).json({
      error: "not_implemented",
      message:
        "Full OAuth authorization flow is not yet implemented. Use a Pterodactyl Client API key (ptlc_*) or a mapped MCP token via MCP_TOKEN_MAP_PATH.",
    });
  });

  app.post("/oauth/token", (_req, res) => {
    res.status(501).json({
      error: "not_implemented",
      message:
        "Token exchange is not yet implemented. Use a Pterodactyl Client API key (ptlc_*) or a mapped MCP token via MCP_TOKEN_MAP_PATH.",
    });
  });
}

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function extractAdminBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

export function getRegisteredClientCount(): number {
  return registeredClients.size;
}
