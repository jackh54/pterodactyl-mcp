import { PterodactylClient, PterodactylApiError } from "../pterodactyl/client.js";
import type { Config } from "../config.js";
import type { AccountInfo } from "../pterodactyl/client.js";
import { loadTokenMap, resolveApiToken } from "./token-map.js";

export interface AuthContext {
  client: PterodactylClient;
  account: AccountInfo;
  tokenFingerprint: string;
  authMethod: "pterodactyl_key" | "mapped_token";
}

const BEARER_PREFIX = "Bearer ";

export function extractBearerToken(req: { headers: { authorization?: string } }): string | null {
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
  const tokenMap = loadTokenMap(config.mcpTokenMapPath);
  const apiKey = resolveApiToken(token, tokenMap);
  const client = new PterodactylClient(config.panelUrl, apiKey);
  const account = await client.validateAccount();

  return {
    client,
    account,
    tokenFingerprint: tokenFingerprint(token),
    authMethod: token.startsWith("ptlc_") ? "pterodactyl_key" : "mapped_token",
  };
}

export function sendUnauthorized(
  res: { req?: { protocol?: string; headers: { host?: string; "x-forwarded-proto"?: string } }; setHeader: (k: string, v: string) => void; status: (c: number) => { json: (b: unknown) => void } },
  message = "Authentication required",
): void {
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

function getPublicBaseUrl(req?: {
  protocol?: string;
  headers: { host?: string; "x-forwarded-proto"?: string };
}): string {
  if (!req) {
    return "http://localhost:3000";
  }
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

export { PterodactylApiError };
