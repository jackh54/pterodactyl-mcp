import { describe, expect, it } from "vitest";
import { ActionConfirmationStore, BackupRateLimiter } from "../src/confirmation/action-store.js";
import { detectEggPreset } from "../src/policy/egg-detector.js";
import { MetricsRegistry } from "../src/metrics/registry.js";
import { loadTokenMap, resolveApiToken } from "../src/auth/token-map.js";
import { normalizeWritablePath } from "../src/files/path-policy.js";
import { PolicyResolver } from "../src/policy/policy-resolver.js";

describe("Phase 4 — egg auto-detection", () => {
  it("detects minecraft from docker image", () => {
    expect(
      detectEggPreset({
        dockerImage: "ghcr.io/pterodactyl/yolks:java_17",
        invocation: "java -jar server.jar",
      }),
    ).toBe("minecraft");
  });

  it("detects rust from invocation", () => {
    expect(
      detectEggPreset({
        dockerImage: "ghcr.io/pterodactyl/games:rust",
        invocation: "./RustDedicated",
      }),
    ).toBe("rust");
  });

  it("applies auto-detected preset in policy resolver", () => {
    const resolver = new PolicyResolver("strict", "generic", {}, true);
    const policy = resolver.forServer("srv1", {
      dockerImage: "java_17",
      invocation: "java -jar server.jar",
    });
    expect(policy.evaluate("say hi").allowed).toBe(true);
    expect(policy.evaluate("give @a diamond").allowed).toBe(false);
  });
});

describe("Phase 4 — action confirmation", () => {
  it("confirms write_file actions with fingerprint", () => {
    const store = new ActionConfirmationStore(60_000);
    const fp = ActionConfirmationStore.fingerprint("write_file", "abc12345", "/server.properties");
    const pending = store.create(1, "abc12345", "write_file", fp);
    expect(store.consume(pending.token, 1, "abc12345", "write_file", fp).ok).toBe(true);
  });
});

describe("Phase 4 — backup rate limiter", () => {
  it("limits backups per server", () => {
    const limiter = new BackupRateLimiter(60_000);
    expect(limiter.check("srv1").allowed).toBe(true);
    limiter.record("srv1");
    expect(limiter.check("srv1").allowed).toBe(false);
  });
});

describe("Phase 4 — metrics", () => {
  it("exports prometheus format", () => {
    const registry = new MetricsRegistry();
    registry.recordToolCall("get_server", "success");
    registry.setActiveSessions(2);
    const output = registry.toPrometheus();
    expect(output).toContain("pterodactyl_mcp_tool_calls_total");
    expect(output).toContain("pterodactyl_mcp_active_sessions");
  });
});

describe("Phase 4 — token map", () => {
  it("resolves mapped tokens to pterodactyl keys", () => {
    const map = loadTokenMap(undefined);
    expect(map).toEqual({});
    expect(resolveApiToken("ptlc_abc", map)).toBe("ptlc_abc");
    expect(
      resolveApiToken("mcp_user1", {
        mcp_user1: { pterodactylApiKey: "ptlc_real" },
      }),
    ).toBe("ptlc_real");
  });
});

describe("Phase 4 — write path policy", () => {
  it("blocks writing jar files", () => {
    expect(normalizeWritablePath("/plugins/plugin.jar").valid).toBe(false);
    expect(normalizeWritablePath("/server.properties").valid).toBe(true);
  });
});
