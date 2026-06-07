import type { Request, Response, NextFunction } from "express";
import { PterodactylClient, PterodactylApiError } from "../pterodactyl/client.js";
import type { Config } from "../config.js";
import type { AccountInfo } from "../pterodactyl/client.js";

export interface AuthContext {
  client: PterodactylClient;
  account: AccountInfo;
  tokenFingerprint: string;
}

const BEARER_PREFIX = "Bearer ";

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

export function tokenFingerprint(token: string): string {
  return token.slice(0, 8) + "…" + token.slice(-4);
}

export async function authenticateRequest(
  config: Config,
  token: string,
): Promise<AuthContext> {
  const client = new PterodactylClient(config.panelUrl, token);
  const account = await client.validateAccount();
  return {
    client,
    account,
    tokenFingerprint: tokenFingerprint(token),
  };
}

export function sendUnauthorized(res: Response, message = "Authentication required"): void {
  const resourceMetadataUrl = `${getPublicBaseUrl(res.req)}/.well-known/oauth-protected-resource`;
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="pterodactyl-mcp", resource_metadata="${resourceMetadataUrl}"`,
  );
  res.status(401).json({
    error: "unauthorized",
    message,
  });
}

function getPublicBaseUrl(req: Request | undefined): string {
  if (!req) {
    return "http://localhost:3000";
  }
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function createAuthMiddleware(config: Config) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearerToken(req);
    if (!token) {
      sendUnauthorized(res);
      return;
    }

    try {
      const auth = await authenticateRequest(config, token);
      (req as Request & { auth: AuthContext }).auth = auth;
      next();
    } catch (error) {
      if (error instanceof PterodactylApiError && error.status === 401) {
        sendUnauthorized(res, "Invalid or expired Pterodactyl API key");
        return;
      }
      next(error);
    }
  };
}

export function getAuth(req: Request): AuthContext {
  const auth = (req as Request & { auth?: AuthContext }).auth;
  if (!auth) {
    throw new Error("Request is not authenticated");
  }
  return auth;
}
