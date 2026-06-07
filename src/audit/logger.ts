import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface AuditEntry {
  timestamp: string;
  userId?: number;
  userEmail?: string;
  tool: string;
  serverId?: string;
  arguments: Record<string, unknown>;
  status: "success" | "denied" | "error";
  message?: string;
  clientIp?: string;
}

export class AuditLogger {
  constructor(private readonly logPath?: string) {
    if (logPath) {
      mkdirSync(dirname(logPath), { recursive: true });
    }
  }

  log(entry: Omit<AuditEntry, "timestamp">): void {
    const line = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    if (this.logPath) {
      appendFileSync(this.logPath, `${line}\n`, "utf8");
    } else {
      console.log(`[audit] ${line}`);
    }
  }
}
