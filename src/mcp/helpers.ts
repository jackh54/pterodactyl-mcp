import type { ServerDetails } from "../pterodactyl/client.js";
import type { WebSocketCredentials } from "../pterodactyl/console-session.js";
import { normalizeWingsSocketUrl } from "../pterodactyl/wings-socket.js";
import type { McpContext } from "./context.js";

export function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

export function checkRateLimit(ctx: McpContext, tool: string): void {
  const result = ctx.rateLimiter.check(ctx.auth.tokenFingerprint);
  if (!result.allowed) {
    ctx.metrics.recordRateLimitHit();
    ctx.audit.log({
      userId: ctx.auth.account.id,
      userEmail: ctx.auth.account.email,
      tool,
      arguments: {},
      status: "denied",
      message: "Rate limit exceeded",
      clientIp: ctx.clientIp,
    });
    throw new Error(
      `Rate limit exceeded. Retry after ${result.retryAfterSeconds ?? 60} seconds.`,
    );
  }
}

export async function requireServerWithPermission(
  ctx: McpContext,
  serverId: string,
  permission: string,
  tool: string,
): Promise<ServerDetails> {
  const server = await ctx.auth.client.getServer(serverId);
  if (!ctx.auth.client.hasPermission(server, permission)) {
    ctx.audit.log({
      userId: ctx.auth.account.id,
      userEmail: ctx.auth.account.email,
      tool,
      serverId,
      arguments: { server_id: serverId },
      status: "denied",
      message: `Missing ${permission} permission`,
      clientIp: ctx.clientIp,
    });
    throw new Error(`You do not have permission (${permission}) on this server.`);
  }
  return server;
}

export async function requireServerWithConsole(
  ctx: McpContext,
  serverId: string,
  tool: string,
): Promise<ServerDetails> {
  return requireServerWithPermission(ctx, serverId, "control.console", tool);
}

export async function prepareConsoleAccess(
  ctx: McpContext,
  serverId: string,
  tool: string,
): Promise<{ server: ServerDetails; credentials: WebSocketCredentials }> {
  const server = await requireServerWithConsole(ctx, serverId, tool);
  if (server.isSuspended || server.isInstalling) {
    throw new Error("Server is suspended or still installing.");
  }

  const resources = await ctx.auth.client.getServerResources(serverId);
  if (resources.currentState !== "running") {
    throw new Error(
      `Console unavailable: server is ${resources.currentState}. Start the server first.`,
    );
  }

  const credentials = await ctx.auth.client.getWebSocketCredentials(serverId);
  return {
    server,
    credentials: {
      token: credentials.token,
      socket: normalizeWingsSocketUrl(credentials.socket, ctx.config.wingsSocketHost),
    },
  };
}

export function auditSuccess(
  ctx: McpContext,
  tool: string,
  args: Record<string, unknown>,
  serverId?: string,
): void {
  ctx.metrics.recordToolCall(tool, "success");
  ctx.audit.log({
    userId: ctx.auth.account.id,
    userEmail: ctx.auth.account.email,
    tool,
    serverId,
    arguments: args,
    status: "success",
    clientIp: ctx.clientIp,
  });
}

export function auditError(
  ctx: McpContext,
  tool: string,
  args: Record<string, unknown>,
  message: string,
  serverId?: string,
): void {
  ctx.metrics.recordToolCall(tool, "error");
  ctx.audit.log({
    userId: ctx.auth.account.id,
    userEmail: ctx.auth.account.email,
    tool,
    serverId,
    arguments: args,
    status: "error",
    message,
    clientIp: ctx.clientIp,
  });
}

export function auditDenied(
  ctx: McpContext,
  tool: string,
  args: Record<string, unknown>,
  message: string,
  serverId?: string,
): void {
  ctx.metrics.recordToolCall(tool, "denied");
  ctx.audit.log({
    userId: ctx.auth.account.id,
    userEmail: ctx.auth.account.email,
    tool,
    serverId,
    arguments: args,
    status: "denied",
    message,
    clientIp: ctx.clientIp,
  });
}

export function formatPterodactylError(error: unknown): string {
  if (error instanceof Error && "status" in error) {
    const apiError = error as Error & { status: number };
    return `${apiError.message} (HTTP ${apiError.status})`;
  }
  return error instanceof Error ? error.message : "Unknown error";
}
