import { z } from "zod";

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
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const panelUrl = env.PTERODACTYL_PANEL_URL;
  if (!panelUrl) {
    throw new Error("PTERODACTYL_PANEL_URL is required");
  }

  return configSchema.parse({
    panelUrl: panelUrl.replace(/\/$/, ""),
    host: env.HOST,
    port: env.PORT,
    mcpEnabled: env.MCP_ENABLED,
    auditLogPath: env.AUDIT_LOG_PATH,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    allowedHosts: env.ALLOWED_HOSTS,
  });
}
