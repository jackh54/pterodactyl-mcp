export type PolicyMode = "strict" | "standard" | "admin";

export type PolicyPreset = "generic" | "minecraft" | "rust";

const GENERIC_STRICT_ALLOWLIST: RegExp[] = [
  /^(help|\?|version|status|info|ping|list|players?)$/i,
  /^say\s+.+/i,
];

const MINECRAFT_STRICT_ALLOWLIST: RegExp[] = [
  ...GENERIC_STRICT_ALLOWLIST,
  /^whitelist\s+(list|on|off)$/i,
  /^list\s*(uonline|banned)?$/i,
  /^tps$/i,
  /^gc$/i,
  /^seed$/i,
  /^time\s+(query|set)\b/i,
  /^weather\s+(clear|rain|thunder)/i,
];

const RUST_STRICT_ALLOWLIST: RegExp[] = [
  ...GENERIC_STRICT_ALLOWLIST,
  /^status$/i,
  /^global\.\w+/i,
  /^serverinfo$/i,
];

const STANDARD_BLOCKED: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bchmod\s+[0-7]{3,4}\b/i,
  /\bchown\b/i,
  /\bkill\s+-9\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bformat\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bwget\b.*\|\s*sh/i,
  /\bcurl\b.*\|\s*sh/i,
  /\bop\s+\S+/i,
  /\bdeop\b/i,
  /\bwhitelist\s+remove\b/i,
  /\bban-ip\b/i,
  /\bstop\b/i,
];

const ADMIN_BLOCKED: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bdd\s+if=/i,
  /\bwget\b.*\|\s*sh/i,
  /\bcurl\b.*\|\s*sh/i,
  /\bmkfs\b/i,
];

export function getStrictAllowlist(preset: PolicyPreset): RegExp[] {
  switch (preset) {
    case "minecraft":
      return MINECRAFT_STRICT_ALLOWLIST;
    case "rust":
      return RUST_STRICT_ALLOWLIST;
    default:
      return GENERIC_STRICT_ALLOWLIST;
  }
}

export function getBlockedPatterns(mode: PolicyMode): RegExp[] {
  switch (mode) {
    case "admin":
      return ADMIN_BLOCKED;
    case "standard":
      return STANDARD_BLOCKED;
    default:
      return [];
  }
}

export interface CommandPolicyResult {
  allowed: boolean;
  reason?: string;
  matchedPattern?: string;
  mode: PolicyMode;
}

export class CommandPolicy {
  private readonly allowlist: RegExp[];
  private readonly blocklist: RegExp[];

  constructor(
    private readonly mode: PolicyMode,
    private readonly preset: PolicyPreset = "generic",
  ) {
    this.allowlist = mode === "strict" ? getStrictAllowlist(preset) : [];
    this.blocklist = getBlockedPatterns(mode);
  }

  evaluate(command: string): CommandPolicyResult {
    const trimmed = command.trim();
    if (!trimmed) {
      return { allowed: false, reason: "Command cannot be empty", mode: this.mode };
    }

    if (trimmed.length > 512) {
      return {
        allowed: false,
        reason: "Command exceeds maximum length of 512 characters",
        mode: this.mode,
      };
    }

    if (this.mode === "strict") {
      const allowed = this.allowlist.some((pattern) => pattern.test(trimmed));
      if (!allowed) {
        return {
          allowed: false,
          reason: `Command not in strict-mode allowlist (preset: ${this.preset})`,
          mode: this.mode,
        };
      }
      return { allowed: true, mode: this.mode };
    }

    for (const pattern of this.blocklist) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: "Command matches a blocked pattern",
          matchedPattern: pattern.source,
          mode: this.mode,
        };
      }
    }

    return { allowed: true, mode: this.mode };
  }
}

export function createCommandPolicy(
  mode: PolicyMode,
  preset: PolicyPreset,
): CommandPolicy {
  return new CommandPolicy(mode, preset);
}
