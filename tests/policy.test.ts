import { describe, expect, it } from "vitest";
import { CommandPolicy } from "../src/policy/command-policy.js";

describe("CommandPolicy", () => {
  const policy = new CommandPolicy();

  it("allows safe commands", () => {
    expect(policy.evaluate("say Hello world").allowed).toBe(true);
    expect(policy.evaluate("list").allowed).toBe(true);
    expect(policy.evaluate("status").allowed).toBe(true);
  });

  it("blocks empty commands", () => {
    expect(policy.evaluate("   ").allowed).toBe(false);
  });

  it("blocks dangerous patterns", () => {
    expect(policy.evaluate("sudo rm -rf /").allowed).toBe(false);
    expect(policy.evaluate("op Steve").allowed).toBe(false);
    expect(policy.evaluate("stop").allowed).toBe(false);
    expect(policy.evaluate("shutdown now").allowed).toBe(false);
  });

  it("blocks overly long commands", () => {
    expect(policy.evaluate("a".repeat(513)).allowed).toBe(false);
  });
});

describe("loadConfig", () => {
  it("requires panel URL", async () => {
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig({})).toThrow("PTERODACTYL_PANEL_URL is required");
  });

  it("parses config from env", async () => {
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig({
      PTERODACTYL_PANEL_URL: "https://panel.example.com/",
      PORT: "8080",
      MCP_ENABLED: "false",
    });
    expect(config.panelUrl).toBe("https://panel.example.com");
    expect(config.port).toBe(8080);
    expect(config.mcpEnabled).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows requests under limit", async () => {
    const { RateLimiter } = await import("../src/rate-limit.js");
    const limiter = new RateLimiter(3);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(false);
  });
});
