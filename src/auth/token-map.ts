import { readFileSync, existsSync } from "node:fs";

export interface MappedToken {
  pterodactylApiKey: string;
  label?: string;
}

export type TokenMap = Record<string, MappedToken>;

export function loadTokenMap(path?: string): TokenMap {
  if (!path || !existsSync(path)) {
    return {};
  }

  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "tokens" in parsed &&
    typeof (parsed as { tokens: unknown }).tokens === "object" &&
    (parsed as { tokens: unknown }).tokens !== null
  ) {
    return (parsed as { tokens: TokenMap }).tokens;
  }
  if (typeof parsed === "object" && parsed !== null) {
    return parsed as TokenMap;
  }
  return {};
}

export function resolveApiToken(bearerToken: string, tokenMap: TokenMap): string {
  if (bearerToken.startsWith("ptlc_")) {
    return bearerToken;
  }

  const mapped = tokenMap[bearerToken];
  if (mapped?.pterodactylApiKey) {
    return mapped.pterodactylApiKey;
  }

  return bearerToken;
}
