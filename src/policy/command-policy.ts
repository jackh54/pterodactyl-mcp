const DEFAULT_BLOCKED_PATTERNS: RegExp[] = [
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

export interface CommandPolicyResult {
  allowed: boolean;
  reason?: string;
  matchedPattern?: string;
}

export class CommandPolicy {
  constructor(private readonly blockedPatterns: RegExp[] = DEFAULT_BLOCKED_PATTERNS) {}

  evaluate(command: string): CommandPolicyResult {
    const trimmed = command.trim();
    if (!trimmed) {
      return { allowed: false, reason: "Command cannot be empty" };
    }

    if (trimmed.length > 512) {
      return { allowed: false, reason: "Command exceeds maximum length of 512 characters" };
    }

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: "Command matches a blocked pattern",
          matchedPattern: pattern.source,
        };
      }
    }

    return { allowed: true };
  }
}

export const commandPolicy = new CommandPolicy();
