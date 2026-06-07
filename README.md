# pterodactyl-mcp

MCP server for [Pterodactyl Panel](https://pterodactyl.io). Lets AI clients like Cursor connect over HTTP, authenticate with a Pterodactyl Client API key, and manage only the servers that key has access to.

## Features

### Phase 1
- Streamable HTTP MCP transport, Bearer auth, core server tools, audit logging, rate limiting

### Phase 2
- WebSocket console output, command policy modes, MCP resources, `diagnose_server` prompt

### Phase 3
- **`server_power`** — start/stop/restart/kill with confirmation flow for destructive actions
- **File tools** — `list_server_files`, `read_server_file` (read-only, path policy enforced)
- **`get_server_activity`** — recent panel audit log entries
- **IP allowlist** — restrict MCP endpoint access by client IP
- **Per-server policy overrides** — JSON file for server-specific command policies
- **`safe_restart` prompt** — guided restart workflow with confirmation steps

## Quick start

```bash
cp .env.example .env
# Set PTERODACTYL_PANEL_URL
npm install && npm run dev
```

## Connect from Cursor

```json
{
  "mcpServers": {
    "pterodactyl": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ptlc_YOUR_CLIENT_API_KEY"
      }
    }
  }
}
```

## MCP tools

| Tool | Permission | Description |
|------|------------|-------------|
| `list_accessible_servers` | — | List all accessible servers |
| `get_server` | — | Server details and permissions |
| `get_server_resources` | `control.console` | CPU, RAM, disk, power state |
| `get_console_output` | `control.console` | Recent console logs (WebSocket) |
| `send_console_command` | `control.console` | Send console command |
| `server_power` | `control.start/stop/restart` | Power actions with confirmation |
| `list_server_files` | `file.read` | Directory listing |
| `read_server_file` | `file.read-content` | Read file contents (size-capped) |
| `get_server_activity` | server access | Recent activity log |

## Power actions with confirmation

Destructive power actions (`stop`, `restart`, `kill`) require a two-step flow unless `POWER_AUTO_CONFIRM=true`:

```
1. server_power({ server_id, signal: "restart" })
   → returns confirmation_token

2. server_power({ server_id, signal: "restart", confirmation_token: "..." })
   → executes the action
```

`start` never requires confirmation.

## Command policy

| Mode | Behavior |
|------|----------|
| `standard` | Blocklist (default) |
| `strict` | Allowlist with game presets |
| `admin` | Minimal blocks |

Per-server overrides via JSON:

```json
{
  "1a2b3c4d": { "mode": "strict", "preset": "minecraft" }
}
```

Set `POLICY_OVERRIDES_PATH=./policies/overrides.json`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PTERODACTYL_PANEL_URL` | — | Panel base URL (required) |
| `MCP_ENABLED` | `true` | Master on/off switch |
| `ALLOWED_IPS` | — | Comma-separated IP allowlist for `/mcp` |
| `COMMAND_POLICY_MODE` | `standard` | `strict`, `standard`, or `admin` |
| `COMMAND_POLICY_PRESET` | `generic` | `generic`, `minecraft`, or `rust` |
| `POLICY_OVERRIDES_PATH` | — | JSON file for per-server policy overrides |
| `FILE_MAX_READ_BYTES` | `262144` | Max file read size (256 KB) |
| `POWER_AUTO_CONFIRM` | `false` | Skip confirmation for stop/restart/kill |
| `POWER_CONFIRMATION_TTL_MS` | `300000` | Confirmation token TTL (5 min) |

See `.env.example` for the full list.

## MCP prompts

| Prompt | Description |
|--------|-------------|
| `diagnose_server` | Troubleshooting workflow with status, resources, logs |
| `safe_restart` | Guided restart with warning + confirmation steps |

## License

MIT
