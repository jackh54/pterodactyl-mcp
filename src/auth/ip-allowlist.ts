import type { Request, Response, NextFunction } from "express";

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }
  return ip;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return normalizeIp(forwarded.split(",")[0]!.trim());
  }
  return normalizeIp(req.ip ?? req.socket.remoteAddress ?? "");
}

function ipMatchesPattern(ip: string, pattern: string): boolean {
  if (pattern === ip) return true;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return ip.startsWith(prefix);
  }
  return false;
}

export function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  const normalized = normalizeIp(ip);
  return allowedIps.some((pattern) => ipMatchesPattern(normalized, pattern.trim()));
}

export function createIpAllowlistMiddleware(allowedIps: string[] | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowedIps?.length) {
      next();
      return;
    }

    const clientIp = getClientIp(req);
    if (!isIpAllowed(clientIp, allowedIps)) {
      res.status(403).json({
        error: "forbidden",
        message: "Your IP address is not allowed to access this MCP server.",
      });
      return;
    }

    next();
  };
}

export { getClientIp };
