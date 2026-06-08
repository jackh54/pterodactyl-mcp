import { createHash, randomBytes } from "node:crypto";

export type ActionKind =
  | "write_file"
  | "create_backup"
  | "restore_backup"
  | "delete_backup"
  | "delete_files"
  | "delete_database"
  | "delete_subuser"
  | "delete_allocation"
  | "create_server"
  | "delete_server";

export interface PendingAction {
  token: string;
  userId: number;
  serverId: string;
  kind: ActionKind;
  fingerprint: string;
  createdAt: number;
  expiresAt: number;
}

export class ActionConfirmationStore {
  private readonly pending = new Map<string, PendingAction>();

  constructor(private readonly ttlMs: number) {}

  create(
    userId: number,
    serverId: string,
    kind: ActionKind,
    fingerprint: string,
  ): PendingAction {
    this.evictExpired();

    const token = randomBytes(24).toString("hex");
    const now = Date.now();
    const entry: PendingAction = {
      token,
      userId,
      serverId,
      kind,
      fingerprint,
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
    kind: ActionKind,
    fingerprint: string,
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
    if (entry.kind !== kind) {
      return { ok: false, reason: "Confirmation token is for a different action" };
    }
    if (entry.fingerprint !== fingerprint) {
      return { ok: false, reason: "Confirmation token does not match this request" };
    }
    if (Date.now() > entry.expiresAt) {
      this.pending.delete(token);
      return { ok: false, reason: "Confirmation token has expired" };
    }

    this.pending.delete(token);
    return { ok: true };
  }

  static fingerprint(kind: ActionKind, serverId: string, detail: string): string {
    return createHash("sha256")
      .update(`${kind}:${serverId}:${detail}`)
      .digest("hex")
      .slice(0, 16);
  }

  static writeFileFingerprint(serverId: string, path: string, content: string): string {
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    return ActionConfirmationStore.fingerprint("write_file", serverId, `${path}:${contentHash}`);
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

export class BackupRateLimiter {
  private readonly lastBackup = new Map<string, number>();

  constructor(private readonly intervalMs: number) {}

  check(serverId: string): { allowed: boolean; retryAfterSeconds?: number } {
    const last = this.lastBackup.get(serverId);
    if (!last) {
      return { allowed: true };
    }

    const elapsed = Date.now() - last;
    if (elapsed >= this.intervalMs) {
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((this.intervalMs - elapsed) / 1000),
    };
  }

  record(serverId: string): void {
    this.lastBackup.set(serverId, Date.now());
  }
}
