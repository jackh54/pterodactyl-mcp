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

### Phase 5 — Extended tools
- **File operations** — download, upload, delete, rename, pull from URL, signed download URLs
- **Backup management** — restore, delete, download URL (create was Phase 4)
- **Console search** — grep-style filtering on `get_console_output` (`search`, `regex`, `case_insensitive`, `invert`)
- **Network allocations** — list/create/update/delete IP:port assignments
- **Subuser management** — list, create, update, delete subusers and permissions
- **Database management** — list, create, rotate password, delete per-server databases
- **Bulk operations** — multi-server resources, file reads, console output
- **Server provisioning** — optional Application API for `create_server` / `delete_server`

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
| `get_console_output` | always | `control.console` (+ search params) |
| `send_console_command` | always | `control.console` |
| `server_power` | always | `control.start/stop/restart` |
| `list_server_files` | always | `file.read` |
| `read_server_file` | always | `file.read-content` |
| `get_server_file_download_url` | always | `file.read-content` |
| `download_server_file` | always | `file.read-content` |
| `get_server_activity` | always | server access |
| `list_server_backups` | always | `backup.read` |
| `get_backup_download_url` | always | `backup.download` |
| `list_server_allocations` | always | `allocation.read` |
| `create_server_allocation` | always | `allocation.create` |
| `update_server_allocation` | always | `allocation.update` |
| `list_server_subusers` | always | `user.read` |
| `get_server_subuser` | always | `user.read` |
| `create_server_subuser` | always | `user.create` |
| `update_server_subuser` | always | `user.update` |
| `list_server_databases` | always | `database.read` |
| `create_server_database` | always | `database.create` |
| `rotate_server_database_password` | always | `database.update` |
| `bulk_get_server_resources` | always | `control.console` per server |
| `bulk_read_server_files` | always | `file.read-content` per server |
| `bulk_get_console_output` | always | `control.console` per server |
| `write_server_file` | `ENABLE_FILE_WRITE=true` | `file.update` + confirmation |
| `create_server_backup` | `ENABLE_BACKUPS=true` | `backup.create` + confirmation |
| `restore_server_backup` | `ENABLE_BACKUPS=true` | `backup.restore` + confirmation |
| `delete_server_backup` | `ENABLE_BACKUPS=true` | `backup.delete` + confirmation |
| `upload_server_file` | `ENABLE_FILE_MUTATIONS=true` | `file.create` |
| `create_server_folder` | `ENABLE_FILE_MUTATIONS=true` | `file.create` |
| `delete_server_files` | `ENABLE_FILE_MUTATIONS=true` | `file.delete` + confirmation |
| `rename_server_files` | `ENABLE_FILE_MUTATIONS=true` | `file.update` |
| `pull_remote_file` | `ENABLE_FILE_MUTATIONS=true` | `file.create` |
| `delete_server_allocation` | `ENABLE_FILE_MUTATIONS=true` | `allocation.delete` + confirmation |
| `delete_server_subuser` | `ENABLE_FILE_MUTATIONS=true` | `user.delete` + confirmation |
| `delete_server_database` | `ENABLE_FILE_MUTATIONS=true` | `database.delete` + confirmation |
| `create_server` | `ENABLE_APPLICATION_API=true` | admin API key + confirmation |
| `delete_server` | `ENABLE_APPLICATION_API=true` | admin API key + confirmation |

## Configuration

```bash
# Metrics
METRICS_ENABLED=true

# Opt-in write/backup
ENABLE_FILE_WRITE=false
ENABLE_BACKUPS=false
ENABLE_FILE_MUTATIONS=false
BACKUP_RATE_LIMIT_MS=3600000

# Application API (server provisioning)
ENABLE_APPLICATION_API=false
# PTERODACTYL_APPLICATION_API_KEY=ptla_...

# Bulk operations
BULK_MAX_SERVERS=10

# Egg-aware command policy
POLICY_AUTO_DETECT_EGG=true

# Token mapping (optional)
MCP_TOKEN_MAP_PATH=./policies/token-map.json

# Dynamic Client Registration (optional)
MCP_ADMIN_SECRET=your-secret
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
