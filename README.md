# pterodactyl-mcp

MCP server for [Pterodactyl Panel](https://pterodactyl.io). Lets AI clients like Cursor connect over HTTP, authenticate with a Pterodactyl Client API key, and manage only the servers that key has access to.

## Features

### Phases 1–3
- Streamable HTTP MCP, Bearer auth, server/console tools, command policies, WebSocket logs
- Power actions with confirmation, read-only file tools, IP allowlist, policy overrides
- MCP resources and prompts (`diagnose_server`, `safe_restart`)

### Phase 4 — Hardening
- **Prometheus metrics** at `/metrics`
- **Opt-in mutating tools:** `write_server_file`, `create_server_backup` (with confirmation)
- **`list_server_backups`** — always available with `backup.read`
- **Egg auto-detection** — `POLICY_AUTO_DETECT_EGG` picks minecraft/rust presets from docker image
- **OAuth foundation** — metadata endpoints, Dynamic Client Registration (`/oauth/register`)
- **MCP token map** — map custom tokens to Pterodactyl API keys via JSON file

## Quick start

```bash
cp .env.example .env
# Set PTERODACTYL_PANEL_URL
npm install && npm run dev
```

## Cursor config

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

| Tool | Enabled | Permission |
|------|---------|------------|
| `list_accessible_servers` | always | — |
| `get_server` | always | — |
| `get_server_resources` | always | `control.console` |
| `get_console_output` | always | `control.console` |
| `send_console_command` | always | `control.console` |
| `server_power` | always | `control.start/stop/restart` |
| `list_server_files` | always | `file.read` |
| `read_server_file` | always | `file.read-content` |
| `get_server_activity` | always | server access |
| `list_server_backups` | always | `backup.read` |
| `write_server_file` | `ENABLE_FILE_WRITE=true` | `file.update` + confirmation |
| `create_server_backup` | `ENABLE_BACKUPS=true` | `backup.create` + confirmation |

## Phase 4 configuration

```bash
# Metrics
METRICS_ENABLED=true          # GET /metrics (Prometheus text format)

# Opt-in write/backup
ENABLE_FILE_WRITE=false       # write_server_file tool
ENABLE_BACKUPS=false          # create_server_backup tool
BACKUP_RATE_LIMIT_MS=3600000  # 1 backup per server per hour

# Egg-aware command policy
POLICY_AUTO_DETECT_EGG=true   # auto-pick minecraft/rust preset

# Token mapping (optional)
MCP_TOKEN_MAP_PATH=./policies/token-map.json

# Dynamic Client Registration (optional)
MCP_ADMIN_SECRET=your-secret  # POST /oauth/register with Bearer token
```

### Token map example

```json
{
  "tokens": {
    "mcp_cursor_alice": {
      "pterodactylApiKey": "ptlc_...",
      "label": "Alice Cursor session"
    }
  }
}
```

## License

MIT
