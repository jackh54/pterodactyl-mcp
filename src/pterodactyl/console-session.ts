export interface WebSocketCredentials {
  token: string;
  socket: string;
}

export interface ConsoleOutputOptions {
  maxLines?: number;
  timeoutMs?: number;
  idleMs?: number;
}

export interface ConsoleCommandResult {
  command: string;
  output: string[];
  truncated: boolean;
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9?]*[ -/]*[@-~]/g, "");
}

interface WingsMessage {
  event: string;
  args: unknown[];
}

function normalizeEventName(event: string): string {
  return event.trim().toLowerCase();
}

function jwtErrorDetail(message: WingsMessage): string {
  return typeof message.args[0] === "string" ? `: ${message.args[0]}` : "";
}

export interface ConsoleConnectOptions {
  handshakeTimeoutMs?: number;
  authTimeoutMs?: number;
  rejectUnauthorized?: boolean;
  origin?: string;
}

async function importWebSocket(): Promise<typeof import("ws").default> {
  const mod = await import("ws");
  return mod.default;
}

export class ConsoleSession {
  private ws: InstanceType<Awaited<ReturnType<typeof importWebSocket>>> | null = null;
  private authenticated = false;
  private credentials: WebSocketCredentials | null = null;

  constructor(private readonly serverId: string) {}

  async connect(
    credentials: WebSocketCredentials,
    options: ConsoleConnectOptions = {},
  ): Promise<void> {
    const WebSocket = await importWebSocket();
    if (
      this.ws &&
      this.authenticated &&
      this.credentials?.token === credentials.token &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      return;
    }

    await this.close();
    this.credentials = credentials;

    const handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
    const authTimeoutMs = options.authTimeoutMs ?? 10_000;
    const ws = new WebSocket(credentials.socket, {
      handshakeTimeout: handshakeTimeoutMs,
      rejectUnauthorized: options.rejectUnauthorized ?? true,
      origin: options.origin,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let authSent = false;
      const seenEvents: string[] = [];

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        ws.off("message", onMessage);
        ws.off("error", onError);
        ws.off("close", onClose);
        if (error) {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
          reject(error);
        } else {
          resolve();
        }
      };

      const hardTimeout = setTimeout(() => {
        const events =
          seenEvents.length > 0 ? ` (received: ${seenEvents.join(", ")})` : "";
        finish(
          new Error(
            `WebSocket authentication timed out after ${authTimeoutMs}ms connecting to ${credentials.socket}${events}`,
          ),
        );
      }, authTimeoutMs);

      const onError = (error: Error) => {
        let message = error.message;
        if (message.includes("403")) {
          message +=
            ". Wings rejected the WebSocket Origin header — set WINGS_WEBSOCKET_ORIGIN to your panel URL if it differs from PTERODACTYL_PANEL_URL.";
        }
        finish(
          new Error(`WebSocket connection failed for ${credentials.socket}: ${message}`),
        );
      };
      const onClose = () => {
        if (!this.authenticated) {
          finish(new Error("WebSocket closed before authentication completed"));
        }
      };

      const onMessage = (data: unknown) => {
        try {
          const message = JSON.parse(String(data)) as WingsMessage;
          const event = normalizeEventName(message.event);
          seenEvents.push(message.event);
          if (event === "jwt error" || event === "token expired") {
            finish(new Error(`WebSocket auth failed (${message.event}${jwtErrorDetail(message)})`));
            return;
          }
          if (event === "auth success") {
            this.authenticated = true;
            finish();
            return;
          }
          if (authSent && !this.authenticated && event === "status") {
            this.authenticated = true;
            finish();
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const sendAuth = () => {
        authSent = true;
        ws.send(JSON.stringify({ event: "auth", args: [credentials.token] }));
      };

      ws.on("message", onMessage);
      ws.once("error", onError);
      ws.on("close", onClose);
      ws.once("open", sendAuth);
      if (ws.readyState === WebSocket.OPEN) {
        sendAuth();
      }
    });

    this.ws = ws;
  }

  async fetchRecentOutput(options: ConsoleOutputOptions = {}): Promise<string[]> {
    this.ensureConnected();
    const maxLines = options.maxLines ?? 100;
    const timeoutMs = options.timeoutMs ?? 8_000;
    const idleMs = options.idleMs ?? 750;

    this.ws!.send(JSON.stringify({ event: "send logs", args: [] }));
    return this.collectOutput({ maxLines, timeoutMs, idleMs });
  }

  async sendCommandAndCollect(
    command: string,
    options: ConsoleOutputOptions = {},
  ): Promise<ConsoleCommandResult> {
    this.ensureConnected();
    const maxLines = options.maxLines ?? 50;
    const timeoutMs = options.timeoutMs ?? 5_000;
    const idleMs = options.idleMs ?? 500;

    this.ws!.send(JSON.stringify({ event: "send command", args: [command] }));
    const output = await this.collectOutput({ maxLines, timeoutMs, idleMs });

    return {
      command,
      output,
      truncated: output.length >= maxLines,
    };
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
    this.credentials = null;
  }

  private ensureConnected(): void {
    if (!this.ws || !this.authenticated) {
      throw new Error("Console session is not connected");
    }
  }

  private collectOutput(options: {
    maxLines: number;
    timeoutMs: number;
    idleMs: number;
  }): Promise<string[]> {
    const lines: string[] = [];
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let collectionError: Error | null = null;

    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(hardTimeout);
        if (idleTimer) clearTimeout(idleTimer);
        this.ws?.off("message", onMessage);
        if (collectionError) {
          reject(collectionError);
          return;
        }
        resolve(lines);
      };

      const hardTimeout = setTimeout(() => finish(), options.timeoutMs);

      const onMessage = (data: unknown) => {
        try {
          const message = JSON.parse(String(data)) as WingsMessage;
          const event = normalizeEventName(message.event);
          if (event === "console output" && typeof message.args[0] === "string") {
            const line = stripAnsi(message.args[0]).trimEnd();
            if (line.length > 0) {
              lines.push(line);
              if (lines.length >= options.maxLines) {
                finish();
                return;
              }
            }
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => finish(), options.idleMs);
          } else if (event === "jwt error" || event === "token expired") {
            collectionError = new Error(
              `WebSocket session expired while collecting console output (${message.event}${jwtErrorDetail(message)})`,
            );
            finish();
          }
        } catch {
          // ignore malformed messages
        }
      };

      this.ws!.on("message", onMessage);
      idleTimer = setTimeout(() => finish(), options.idleMs);
    });
  }
}

interface SessionEntry {
  session: ConsoleSession;
  lastUsed: number;
}

export class ConsoleSessionManager {
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly maxSessions: number,
    private readonly connectOptions: ConsoleConnectOptions = {},
  ) {}

  async withSession<T>(
    sessionKey: string,
    serverId: string,
    credentials: WebSocketCredentials,
    fn: (session: ConsoleSession) => Promise<T>,
  ): Promise<T> {
    this.evictIdleSessions();
    this.evictOverflow();

    let entry = this.sessions.get(sessionKey);
    if (!entry) {
      entry = { session: new ConsoleSession(serverId), lastUsed: Date.now() };
      this.sessions.set(sessionKey, entry);
    }

    entry.lastUsed = Date.now();
    await entry.session.connect(credentials, this.connectOptions);

    try {
      return await fn(entry.session);
    } finally {
      entry.lastUsed = Date.now();
    }
  }

  private evictIdleSessions(): void {
    const now = Date.now();
    for (const [key, entry] of this.sessions) {
      if (now - entry.lastUsed > this.idleTimeoutMs) {
        void entry.session.close();
        this.sessions.delete(key);
      }
    }
  }

  private evictOverflow(): void {
    if (this.sessions.size <= this.maxSessions) return;
    const sorted = [...this.sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.sessions.size > this.maxSessions) {
      const [key, entry] = sorted.shift()!;
      void entry.session.close();
      this.sessions.delete(key);
    }
  }
}
