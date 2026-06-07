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
  private fileLoggingEnabled: boolean;
  private warnedAboutFileLogging = false;

  constructor(private readonly logPath?: string) {
    this.fileLoggingEnabled = Boolean(logPath);
    if (logPath) {
      try {
        mkdirSync(dirname(logPath), { recursive: true });
      } catch (error) {
        this.fileLoggingEnabled = false;
        this.warnFileLoggingDisabled(error);
      }
    }
  }

  log(entry: Omit<AuditEntry, "timestamp">): void {
    const line = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    if (this.logPath && this.fileLoggingEnabled) {
      try {
        appendFileSync(this.logPath, `${line}\n`, "utf8");
        return;
      } catch (error) {
        this.fileLoggingEnabled = false;
        this.warnFileLoggingDisabled(error);
      }
    }

    console.log(`[audit] ${line}`);
  }

  private warnFileLoggingDisabled(error: unknown): void {
    if (this.warnedAboutFileLogging) {
      return;
    }
    this.warnedAboutFileLogging = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[audit] File logging disabled for ${this.logPath ?? "unknown path"}: ${message}. Falling back to stdout.`,
    );
  }
}
