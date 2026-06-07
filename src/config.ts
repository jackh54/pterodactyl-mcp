import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";

const policyModeSchema = z.enum(["strict", "standard", "admin"]);
const policyPresetSchema = z.enum(["generic", "minecraft", "rust"]);

const configSchema = z.object({
  panelUrl: z.string().url(),
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  mcpEnabled: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  auditLogPath: z.string().optional(),
  rateLimitPerMinute: z.coerce.number().int().min(1).default(60),
  allowedHosts: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((h) => h.trim()).filter(Boolean) : undefined)),
  allowedIps: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((ip) => ip.trim()).filter(Boolean) : undefined)),
  commandPolicyMode: policyModeSchema.default("standard"),
  commandPolicyPreset: policyPresetSchema.default("generic"),
  policyOverridesPath: z.string().optional(),
  consoleMaxLines: z.coerce.number().int().min(1).max(500).default(100),
  consoleTimeoutMs: z.coerce.number().int().min(1000).max(60_000).default(8000),
  consoleSessionIdleMs: z.coerce.number().int().min(60_000).max(3_600_000).default(300_000),
  consoleMaxSessions: z.coerce.number().int().min(1).max(200).default(32),
  fileMaxReadBytes: z.coerce.number().int().min(1024).max(5_242_880).default(262_144),
  powerConfirmationTtlMs: z.coerce.number().int().min(30_000).max(900_000).default(300_000),
  powerAutoConfirm: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const panelUrl = env.PTERODACTYL_PANEL_URL;
  if (!panelUrl) {
    throw new Error("PTERODACTYL_PANEL_URL is required");
  }

  const config = configSchema.parse({
    panelUrl: panelUrl.replace(/\/$/, ""),
    host: env.HOST,
    port: env.PORT,
    mcpEnabled: env.MCP_ENABLED,
    auditLogPath: env.AUDIT_LOG_PATH,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    allowedHosts: env.ALLOWED_HOSTS,
    allowedIps: env.ALLOWED_IPS,
    commandPolicyMode: env.COMMAND_POLICY_MODE,
    commandPolicyPreset: env.COMMAND_POLICY_PRESET,
    policyOverridesPath: env.POLICY_OVERRIDES_PATH,
    consoleMaxLines: env.CONSOLE_MAX_LINES,
    consoleTimeoutMs: env.CONSOLE_TIMEOUT_MS,
    consoleSessionIdleMs: env.CONSOLE_SESSION_IDLE_MS,
    consoleMaxSessions: env.CONSOLE_MAX_SESSIONS,
    fileMaxReadBytes: env.FILE_MAX_READ_BYTES,
    powerConfirmationTtlMs: env.POWER_CONFIRMATION_TTL_MS,
    powerAutoConfirm: env.POWER_AUTO_CONFIRM,
  });

  if (config.policyOverridesPath && !existsSync(config.policyOverridesPath)) {
    throw new Error(`POLICY_OVERRIDES_PATH not found: ${config.policyOverridesPath}`);
  }

  if (config.policyOverridesPath) {
    try {
      JSON.parse(readFileSync(config.policyOverridesPath, "utf8"));
    } catch {
      throw new Error(`POLICY_OVERRIDES_PATH is not valid JSON: ${config.policyOverridesPath}`);
    }
  }

  return config;
}
