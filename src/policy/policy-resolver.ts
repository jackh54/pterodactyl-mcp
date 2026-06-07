import { readFileSync, existsSync } from "node:fs";
import {
  createCommandPolicy,
  type CommandPolicy,
  type PolicyMode,
  type PolicyPreset,
} from "./command-policy.js";

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
  ) {
    this.defaultPolicy = createCommandPolicy(defaultMode, defaultPreset);
  }

  forServer(serverId: string): CommandPolicy {
    const override = this.overrides[serverId];
    if (!override?.mode && !override?.preset) {
      return this.defaultPolicy;
    }
    return createCommandPolicy(
      override.mode ?? this.defaultMode,
      override.preset ?? this.defaultPreset,
    );
  }
}
