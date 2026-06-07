import { truncateContent } from "../files/path-policy.js";
import type { PterodactylClient } from "./client.js";
import { stripAnsi } from "./console-session.js";
import type { ConsoleConnectOptions, ConsoleSessionManager } from "./console-session.js";
import type { WebSocketCredentials } from "./console-session.js";

export const COMMON_LOG_PATHS = [
  "/logs/latest.log",
  "/logs/latest_log.txt",
  "/console.log",
  "/logs/console.log",
];

export type ConsoleTransport = "auto" | "file" | "websocket";

export interface ConsoleOutputResult {
  lines: string[];
  source: "file" | "websocket";
  filePath?: string;
}

export function tailLines(content: string, maxLines: number): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => stripAnsi(line).trimEnd())
    .filter((line) => line.length > 0)
    .slice(-maxLines);
}

export async function fetchConsoleFromFiles(
  client: PterodactylClient,
  serverId: string,
  maxLines: number,
  maxReadBytes: number,
): Promise<ConsoleOutputResult | null> {
  for (const filePath of COMMON_LOG_PATHS) {
    try {
      const raw = await client.readFile(serverId, filePath);
      const truncated = truncateContent(raw, maxReadBytes);
      const lines = tailLines(truncated.content, maxLines);
      if (lines.length === 0 && !truncated.content.trim()) {
        continue;
      }
      return { lines, source: "file", filePath };
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchConsoleFromWebSocket(
  sessions: ConsoleSessionManager,
  sessionKey: string,
  serverId: string,
  credentials: WebSocketCredentials,
  options: {
    maxLines: number;
    timeoutMs: number;
    idleMs: number;
    connectOptions?: ConsoleConnectOptions;
  },
): Promise<ConsoleOutputResult> {
  const lines = await sessions.withSession(
    sessionKey,
    serverId,
    credentials,
    (session) =>
      session.fetchRecentOutput({
        maxLines: options.maxLines,
        timeoutMs: options.timeoutMs,
        idleMs: options.idleMs,
      }),
    options.connectOptions,
  );

  return { lines, source: "websocket" };
}

export function logConsoleDebug(enabled: boolean, message: string, details?: unknown): void {
  if (!enabled) {
    return;
  }
  if (details !== undefined) {
    console.error(`[console] ${message}`, details);
  } else {
    console.error(`[console] ${message}`);
  }
}
