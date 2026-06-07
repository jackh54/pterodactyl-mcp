import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { loadTokenMap, type TokenMap } from "./auth/token-map.js";

const policyModeSchema = z.enum(["strict", "standard", "admin"]);
const policyPresetSchema = z.enum(["generic", "minecraft", "rust"]);

const consoleTransportSchema = z.enum(["auto", "file", "websocket"]);

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
  policyAutoDetectEgg: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  policyOverridesPath: z.string().optional(),
  consoleMaxLines: z.coerce.number().int().min(1).max(500).default(100),
  consoleTransport: consoleTransportSchema.default("auto"),
  consoleDebug: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  consoleTimeoutMs: z.coerce.number().int().min(1000).max(60_000).default(12_000),
  consoleIdleMs: z.coerce.number().int().min(100).max(10_000).default(400),
  consoleConnectTimeoutMs: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  consoleWebSocketTimeoutMs: z.coerce.number().int().min(1000).max(30_000).default(4000),
  consoleWebSocketAuthTimeoutMs: z.coerce.number().int().min(1000).max(30_000).default(5000),
  consoleSessionIdleMs: z.coerce.number().int().min(60_000).max(3_600_000).default(300_000),
  consoleMaxSessions: z.coerce.number().int().min(1).max(200).default(32),
  fileMaxReadBytes: z.coerce.number().int().min(1024).max(5_242_880).default(262_144),
  fileMaxWriteBytes: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
  enableFileWrite: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  enableBackups: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  backupRateLimitMs: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),
  powerConfirmationTtlMs: z.coerce.number().int().min(30_000).max(900_000).default(300_000),
  powerAutoConfirm: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  metricsEnabled: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  mcpAdminSecret: z.string().optional(),
  mcpTokenMapPath: z.string().optional(),
  panelRequestTimeoutMs: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  wingsSocketHost: z.string().optional(),
  wingsWebSocketOrigin: z.string().url().optional(),
  wingsTlsInsecure: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof configSchema> & {
  tokenMap: TokenMap;
  wingsWebSocketOrigin: string;
};

function validateJsonFile(path: string, label: string): void {
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`);
  }
  try {
    JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON: ${path}`);
  }
}

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
    policyAutoDetectEgg: env.POLICY_AUTO_DETECT_EGG,
    policyOverridesPath: env.POLICY_OVERRIDES_PATH,
    consoleMaxLines: env.CONSOLE_MAX_LINES,
    consoleTransport: env.CONSOLE_TRANSPORT,
    consoleDebug: env.CONSOLE_DEBUG,
    consoleTimeoutMs: env.CONSOLE_TIMEOUT_MS,
    consoleIdleMs: env.CONSOLE_IDLE_MS,
    consoleConnectTimeoutMs: env.CONSOLE_CONNECT_TIMEOUT_MS,
    consoleWebSocketTimeoutMs: env.CONSOLE_WEBSOCKET_TIMEOUT_MS,
    consoleWebSocketAuthTimeoutMs: env.CONSOLE_WEBSOCKET_AUTH_TIMEOUT_MS,
    consoleSessionIdleMs: env.CONSOLE_SESSION_IDLE_MS,
    consoleMaxSessions: env.CONSOLE_MAX_SESSIONS,
    fileMaxReadBytes: env.FILE_MAX_READ_BYTES,
    fileMaxWriteBytes: env.FILE_MAX_WRITE_BYTES,
    enableFileWrite: env.ENABLE_FILE_WRITE,
    enableBackups: env.ENABLE_BACKUPS,
    backupRateLimitMs: env.BACKUP_RATE_LIMIT_MS,
    powerConfirmationTtlMs: env.POWER_CONFIRMATION_TTL_MS,
    powerAutoConfirm: env.POWER_AUTO_CONFIRM,
    metricsEnabled: env.METRICS_ENABLED,
    mcpAdminSecret: env.MCP_ADMIN_SECRET,
    mcpTokenMapPath: env.MCP_TOKEN_MAP_PATH,
    panelRequestTimeoutMs: env.PANEL_REQUEST_TIMEOUT_MS,
    wingsSocketHost: env.WINGS_SOCKET_HOST,
    wingsWebSocketOrigin: env.WINGS_WEBSOCKET_ORIGIN,
    wingsTlsInsecure: env.WINGS_TLS_INSECURE,
  });

  if (config.policyOverridesPath) {
    validateJsonFile(config.policyOverridesPath, "POLICY_OVERRIDES_PATH");
  }
  if (config.mcpTokenMapPath) {
    validateJsonFile(config.mcpTokenMapPath, "MCP_TOKEN_MAP_PATH");
  }

  const tokenMap = loadTokenMap(config.mcpTokenMapPath);

  return {
    ...config,
    tokenMap,
    wingsWebSocketOrigin: config.wingsWebSocketOrigin ?? config.panelUrl,
  };
}
