import { createHash, randomBytes } from "node:crypto";

export type PowerSignal = "start" | "stop" | "restart" | "kill";

export interface PendingConfirmation {
  token: string;
  userId: number;
  serverId: string;
  signal: PowerSignal;
  createdAt: number;
  expiresAt: number;
}

export class ConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();

  constructor(private readonly ttlMs: number) {}

  create(userId: number, serverId: string, signal: PowerSignal): PendingConfirmation {
    this.evictExpired();

    const token = randomBytes(24).toString("hex");
    const now = Date.now();
    const entry: PendingConfirmation = {
      token,
      userId,
      serverId,
      signal,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.pending.set(token, entry);
    return entry;
  }

  consume(
    token: string,
    userId: number,
    serverId: string,
    signal: PowerSignal,
  ): { ok: true } | { ok: false; reason: string } {
    this.evictExpired();

    const entry = this.pending.get(token);
    if (!entry) {
      return { ok: false, reason: "Invalid or expired confirmation token" };
    }

    if (entry.userId !== userId) {
      return { ok: false, reason: "Confirmation token does not belong to this user" };
    }
    if (entry.serverId !== serverId) {
      return { ok: false, reason: "Confirmation token is for a different server" };
    }
    if (entry.signal !== signal) {
      return { ok: false, reason: "Confirmation token is for a different power action" };
    }
    if (Date.now() > entry.expiresAt) {
      this.pending.delete(token);
      return { ok: false, reason: "Confirmation token has expired" };
    }

    this.pending.delete(token);
    return { ok: true };
  }

  confirmationFingerprint(token: string): string {
    return createHash("sha256").update(token).digest("hex").slice(0, 12);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.pending) {
      if (now > entry.expiresAt) {
        this.pending.delete(token);
      }
    }
  }
}

export function requiresPowerConfirmation(
  signal: PowerSignal,
  autoConfirm: boolean,
): boolean {
  if (autoConfirm) return false;
  return signal !== "start";
}

export const POWER_PERMISSIONS: Record<PowerSignal, string> = {
  start: "control.start",
  stop: "control.stop",
  restart: "control.restart",
  kill: "control.stop",
};
