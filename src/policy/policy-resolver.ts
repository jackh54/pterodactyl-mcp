import { readFileSync, existsSync } from "node:fs";
import {
  createCommandPolicy,
  type CommandPolicy,
  type PolicyMode,
  type PolicyPreset,
} from "./command-policy.js";
import { detectEggPreset } from "./egg-detector.js";
import type { ServerDetails } from "../pterodactyl/client.js";

export interface ServerPolicyOverride {
  mode?: PolicyMode;
  preset?: PolicyPreset;
}

export type PolicyOverrides = Record<string, ServerPolicyOverride>;

export function loadPolicyOverrides(path?: string): PolicyOverrides {
  if (!path || !existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as PolicyOverrides;
  return parsed ?? {};
}

export class PolicyResolver {
  private readonly defaultPolicy: CommandPolicy;

  constructor(
    private readonly defaultMode: PolicyMode,
    private readonly defaultPreset: PolicyPreset,
    private readonly overrides: PolicyOverrides = {},
    private readonly autoDetectEgg = false,
  ) {
    this.defaultPolicy = createCommandPolicy(defaultMode, defaultPreset);
  }

  forServer(serverId: string, server?: Pick<ServerDetails, "dockerImage" | "invocation">): CommandPolicy {
    const override = this.overrides[serverId];
    let preset = override?.preset ?? this.defaultPreset;

    if (!override?.preset && this.autoDetectEgg && server) {
      const detected = detectEggPreset(server);
      if (detected) {
        preset = detected;
      }
    }

    if (!override?.mode && !override?.preset && preset === this.defaultPreset && !this.autoDetectEgg) {
      return this.defaultPolicy;
    }

    if (!override?.mode && preset === this.defaultPreset && this.autoDetectEgg && !server) {
      return this.defaultPolicy;
    }

    return createCommandPolicy(
      override?.mode ?? this.defaultMode,
      preset,
    );
  }
}
