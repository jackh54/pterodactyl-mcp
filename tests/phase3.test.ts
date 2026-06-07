import { describe, expect, it } from "vitest";
import { ConfirmationStore, requiresPowerConfirmation } from "../src/power/confirmation-store.js";
import { normalizeServerPath, truncateContent } from "../src/files/path-policy.js";
import { isIpAllowed } from "../src/auth/ip-allowlist.js";
import { PolicyResolver } from "../src/policy/policy-resolver.js";

describe("ConfirmationStore", () => {
  it("creates and consumes a valid token", () => {
    const store = new ConfirmationStore(60_000);
    const pending = store.create(1, "abc12345", "restart");
    const result = store.consume(pending.token, 1, "abc12345", "restart");
    expect(result.ok).toBe(true);
  });

  it("rejects token for wrong user or signal", () => {
    const store = new ConfirmationStore(60_000);
    const pending = store.create(1, "abc12345", "stop");
    expect(store.consume(pending.token, 2, "abc12345", "stop")).toEqual({
      ok: false,
      reason: "Confirmation token does not belong to this user",
    });
    expect(store.consume(pending.token, 1, "abc12345", "restart")).toEqual({
      ok: false,
      reason: "Confirmation token is for a different power action",
    });
  });

  it("rejects reused tokens", () => {
    const store = new ConfirmationStore(60_000);
    const pending = store.create(1, "abc12345", "restart");
    store.consume(pending.token, 1, "abc12345", "restart");
    expect(store.consume(pending.token, 1, "abc12345", "restart")).toEqual({
      ok: false,
      reason: "Invalid or expired confirmation token",
    });
  });
});

describe("requiresPowerConfirmation", () => {
  it("requires confirmation for destructive actions by default", () => {
    expect(requiresPowerConfirmation("start", false)).toBe(false);
    expect(requiresPowerConfirmation("stop", false)).toBe(true);
    expect(requiresPowerConfirmation("restart", false)).toBe(true);
    expect(requiresPowerConfirmation("kill", false)).toBe(true);
  });

  it("skips confirmation when auto confirm enabled", () => {
    expect(requiresPowerConfirmation("kill", true)).toBe(false);
  });
});

describe("normalizeServerPath", () => {
  it("normalizes relative paths", () => {
    expect(normalizeServerPath("server.properties").normalized).toBe("/server.properties");
  });

  it("blocks path traversal and sensitive files", () => {
    expect(normalizeServerPath("/../etc/passwd").valid).toBe(false);
    expect(normalizeServerPath("/foo/../bar").valid).toBe(false);
    expect(normalizeServerPath("/.env").valid).toBe(false);
  });

  it("allows paths with double dots in segment names", () => {
    expect(normalizeServerPath("/foo..bar/config").valid).toBe(true);
  });
});

describe("truncateContent", () => {
  it("truncates content exceeding byte limit", () => {
    const result = truncateContent("hello world", 5);
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(5);
  });
});

describe("isIpAllowed", () => {
  it("matches exact and wildcard IPs", () => {
    expect(isIpAllowed("203.0.113.10", ["203.0.113.10"])).toBe(true);
    expect(isIpAllowed("203.0.113.10", ["203.0.113.*"])).toBe(true);
    expect(isIpAllowed("203.0.113.10", ["198.51.100.1"])).toBe(false);
  });
});

describe("PolicyResolver", () => {
  it("applies per-server overrides", () => {
    const resolver = new PolicyResolver("standard", "generic", {
      server1: { mode: "strict", preset: "minecraft" },
    });
    expect(resolver.forServer("server1").evaluate("say hi").allowed).toBe(true);
    expect(resolver.forServer("server1").evaluate("give @a diamond").allowed).toBe(false);
    expect(resolver.forServer("other").evaluate("give @a diamond").allowed).toBe(true);
  });
});
