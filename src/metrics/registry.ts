type LabelSet = Record<string, string>;

function labelKey(name: string, labels: LabelSet): string {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`);
  return `${name}{${parts.join(",")}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  increment(name: string, labels: LabelSet = {}, value = 1): void {
    const key = labelKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  setGauge(name: string, value: number, labels: LabelSet = {}): void {
    this.gauges.set(labelKey(name, labels), value);
  }

  recordToolCall(tool: string, status: "success" | "denied" | "error"): void {
    this.increment("pterodactyl_mcp_tool_calls_total", { tool, status });
  }

  recordRateLimitHit(): void {
    this.increment("pterodactyl_mcp_rate_limit_hits_total");
  }

  setActiveSessions(count: number): void {
    this.setGauge("pterodactyl_mcp_active_sessions", count);
  }

  toPrometheus(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters) {
      lines.push(`${key} ${value}`);
    }
    for (const [key, value] of this.gauges) {
      lines.push(`${key} ${value}`);
    }

    if (lines.length === 0) {
      return "# no metrics recorded yet\n";
    }

    return `${lines.join("\n")}\n`;
  }
}

export const metrics = new MetricsRegistry();
