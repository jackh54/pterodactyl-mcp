import { describe, expect, it } from "vitest";
import { CommandPolicy, createCommandPolicy } from "../src/policy/command-policy.js";
import { stripAnsi } from "../src/pterodactyl/console-session.js";

describe("CommandPolicy", () => {
  describe("standard mode", () => {
    const policy = new CommandPolicy("standard");

    it("allows safe commands", () => {
      expect(policy.evaluate("say Hello world").allowed).toBe(true);
      expect(policy.evaluate("list").allowed).toBe(true);
    });

    it("blocks dangerous patterns", () => {
      expect(policy.evaluate("sudo rm -rf /").allowed).toBe(false);
      expect(policy.evaluate("op Steve").allowed).toBe(false);
      expect(policy.evaluate("stop").allowed).toBe(false);
    });
  });

  describe("strict mode (minecraft preset)", () => {
    const policy = createCommandPolicy("strict", "minecraft");

    it("allows minecraft-safe commands", () => {
      expect(policy.evaluate("say Hello").allowed).toBe(true);
      expect(policy.evaluate("whitelist list").allowed).toBe(true);
      expect(policy.evaluate("tps").allowed).toBe(true);
    });

    it("blocks commands outside allowlist", () => {
      expect(policy.evaluate("give @a diamond 64").allowed).toBe(false);
      expect(policy.evaluate("op Steve").allowed).toBe(false);
    });
  });

  describe("admin mode", () => {
    const policy = new CommandPolicy("admin");

    it("allows stop but blocks shell injection", () => {
      expect(policy.evaluate("stop").allowed).toBe(true);
      expect(policy.evaluate("sudo rm -rf /").allowed).toBe(false);
    });
  });

  it("blocks empty and overly long commands", () => {
    const policy = new CommandPolicy("standard");
    expect(policy.evaluate("   ").allowed).toBe(false);
    expect(policy.evaluate("a".repeat(513)).allowed).toBe(false);
  });
});

describe("stripAnsi", () => {
  it("removes ANSI color codes", () => {
    expect(stripAnsi("\x1b[31mError\x1b[0m")).toBe("Error");
  });
});

describe("loadConfig", () => {
  it("requires panel URL", async () => {
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig({})).toThrow("PTERODACTYL_PANEL_URL is required");
  });

  it("parses phase 2 config from env", async () => {
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig({
      PTERODACTYL_PANEL_URL: "https://panel.example.com/",
      COMMAND_POLICY_MODE: "strict",
      COMMAND_POLICY_PRESET: "minecraft",
      CONSOLE_MAX_LINES: "50",
    });
    expect(config.commandPolicyMode).toBe("strict");
    expect(config.commandPolicyPreset).toBe("minecraft");
    expect(config.consoleMaxLines).toBe(50);
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
