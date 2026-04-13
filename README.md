# ghcp-sync

Sync your GitHub Copilot configuration between machines via a lightweight Express server, a CLI client, or directly from any git repository.

## What It Syncs

- **~/.copilot/config.json** -- Copilot agent configuration
- **~/.copilot/copilot-instructions.md** -- Custom instructions for Copilot
- **~/.copilot/agents/** -- Agent definitions (recursive)
- **~/.copilot/hooks/** -- Hook scripts (recursive)
- **~/.copilot/skills/** -- Skill definitions (recursive)
- **~/.copilot/prompts/** -- Reusable prompts (recursive)
- **VS Code Copilot settings** -- Key-level merge of `github.copilot.*`, `chat.promptFilesLocations.*`, `chat.instructionsFilesLocations.*`, and `chat.agent.*` keys from VS Code's `settings.json`

Excluded from sync: `node_modules`, `dist`, `.git`, `logs`, `sessions`, `cache`.

## Pull Modes

ghcp-sync supports two pull modes:

### 1. Server pull: `ghcp-sync pull`

Downloads your Copilot config from a ghcp-sync server. Requires `GHCP_SYNC_URL` and `GHCP_SYNC_KEY` environment variables.

### 2. Repo pull: `ghcp-sync pull --from <url>`

Imports Copilot config directly from any git repository's `.github/` directory. No server needed. Any git URL works -- GitHub, GitLab, Bitbucket, SSH, HTTPS, or local paths.

The `--from` flag performs a shallow clone, copies matching content from `.github/` into the target directory, and cleans up the clone automatically.

**Content mapping** (direct copy, no format conversion):

| Repository source | Local destination |
|---|---|
| `.github/agents/` | `agents/` |
| `.github/skills/` | `skills/` |
| `.github/prompts/` | `prompts/` |
| `.github/hooks/` | `hooks/` |

Both pull modes support the `--target` and `--only` flags.

## Architecture

```
  Machine A (push)                    Server                     Machine B (pull)
 +-----------------+          +-------------------+          +-----------------+
 | ~/.copilot/     |  gzip    |                   |  gzip    | ~/.copilot/     |
 |   config.json   | tarball  |   Express :3457   | tarball  |   config.json   |
 |   agents/       |--------->|                   |--------->|   agents/       |
 |   hooks/        |  PUT     |   data/           |  GET     |   hooks/        |
 |   skills/       | /sync    |   copilot-config  | /sync    |   skills/       |
 |   prompts/      |          |   .tar.gz         |          |   prompts/      |
 |   copilot-      |          |                   |          |   copilot-      |
 |   instructions  |          |   Auth: Bearer    |          |   instructions  |
 |                 |          |   API key         |          |                 |
 | VS Code         |          |   (timing-safe)   |          | VS Code         |
 | settings.json   |          |                   |          | settings.json   |
 | (copilot keys)  |          |                   |          | (key-level      |
 +-----------------+          +-------------------+          |  merge)         |
                                                             +-----------------+
```

## Prerequisites

- **Node.js** >= 18
- **pnpm** (preferred package manager)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/aiguy611/ghcp-sync.git
cd ghcp-sync
pnpm install
pnpm build
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

### 3. Start the server

```bash
# Load env and start
source .env && pnpm server
```

The server listens on `http://0.0.0.0:3457` by default.

### 4. Run the client

```bash
# Set client env vars (or source .env)
export GHCP_SYNC_URL=http://your-server:3457
export GHCP_SYNC_KEY=your-shared-secret

# Push local config to server
pnpm push
# or
node dist/client/cli.js push

# Pull config from server (extracts to current directory by default)
pnpm pull
# or
node dist/client/cli.js pull

# Pull to a specific directory
node dist/client/cli.js pull --target ~/my-copilot-config

# Pull only specific content types
node dist/client/cli.js pull --only agents,skills
```

### 5. Global CLI install (optional)

```bash
pnpm link --global
# Now available as:
ghcp-sync push
ghcp-sync pull
```

## Environment Variables

| Variable            | Used By | Default       | Description                          |
|---------------------|---------|---------------|--------------------------------------|
| `GHCP_SYNC_KEY`    | Both    | *(required)*  | Shared secret for Bearer auth (not needed with `--from`) |
| `GHCP_SYNC_URL`    | Client  | *(required)*  | Server URL, e.g. `http://host:3457` (not needed with `--from`) |
| `GHCP_SYNC_PORT`   | Server  | `3457`        | Port the server listens on           |
| `GHCP_SYNC_DATA_DIR` | Server | `./data`      | Directory to store config tarball    |
| `COPILOT_HOME`     | Client  | `~/.copilot`  | Override the copilot config directory|

## CLI Usage

```
ghcp-sync <push|pull> [options]

Commands:
  push                Upload local Copilot config to server
  pull                Download Copilot config from server or git repo

Pull options:
  --from <url>        Pull from a git repo instead of the sync server
                      Accepts any git URL (GitHub, GitLab, Bitbucket, SSH, local paths)
  --target <dir>      Extract to directory (default: current directory)
  --only <types>      Only extract specified content types (comma-separated)
                      Valid types: agents, skills, prompts, hooks
```

## Usage Examples

### Push config to server

```bash
export GHCP_SYNC_URL=http://my-server:3457
export GHCP_SYNC_KEY=my-secret
ghcp-sync push
# Pushing 4 entries from /Users/you/.copilot
# Push complete. Uploaded 12.3 KB to server.
```

### Pull config from server

```bash
# Pull everything to the current directory
ghcp-sync pull
# Downloading config from server...
# Tarball verified: 8 entries.
# Extracting config to /Users/you/.copilot...
# Pull complete. Extracted 8 entries to /Users/you/.copilot
```

### Pull from a git repository (--from)

```bash
# Pull from any public or private git repo -- no server needed
ghcp-sync pull --from https://github.com/org/repo

# Use SSH URLs
ghcp-sync pull --from git@github.com:org/repo.git --only agents,prompts

# Pull to a specific directory
ghcp-sync pull --from https://github.com/aiguy611/ghcp-tools --target ~/.copilot
```

### Pull to a specific directory

```bash
# Extract config to a custom location instead of the current directory
ghcp-sync pull --target ~/my-copilot-backup
# Works with both server pull and --from
ghcp-sync pull --from https://github.com/org/repo --target ~/my-copilot-backup
```

### Pull only specific content types

```bash
# Only pull agents and skills (skip hooks, prompts, and root files)
ghcp-sync pull --only agents,skills

# Combine --from with --only
ghcp-sync pull --from https://github.com/org/repo --only agents,skills
```

### Combine --target and --only

```bash
# Pull only prompts to a specific directory
ghcp-sync pull --target ./project-config --only prompts

# Same with --from
ghcp-sync pull --from https://github.com/org/repo --target ./project-config --only prompts
```

### Health check

```bash
curl http://my-server:3457/health
# {"ok":true,"hasConfig":true,"configSize":12648}
```

The `/health` endpoint does not require authentication.

## Companion Repos

- **[ghcp-tools](https://github.com/aiguy611/ghcp-tools)** -- A pre-built bundle of agents, skills, prompts, and hooks ready to use with GitHub Copilot. Pull it directly:

  ```bash
  ghcp-sync pull --from https://github.com/aiguy611/ghcp-tools --target ~/.copilot
  ```

## macOS LaunchAgent (Auto-Start on Boot)

Create `~/Library/LaunchAgents/com.ghcp-sync.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ghcp-sync.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/ghcp-sync/dist/server/index.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GHCP_SYNC_KEY</key>
        <string>your-shared-secret</string>
        <key>GHCP_SYNC_PORT</key>
        <string>3457</string>
        <key>GHCP_SYNC_DATA_DIR</key>
        <string>/path/to/ghcp-sync/data</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ghcp-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ghcp-sync.err</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.ghcp-sync.server.plist
```

## How It Works

### Push flow

1. The client scans `~/.copilot/` for allowlisted files and directories (`config.json`, `copilot-instructions.md`, `agents/`, `hooks/`, `skills/`, `prompts/`).
2. It extracts `github.copilot.*` and related keys from your VS Code `settings.json`, writes them to a temporary file inside `~/.copilot/__vscode_settings/copilot-settings.json`.
3. Everything is packed into a gzipped tarball and streamed via `PUT /sync` to the server.
4. The server writes to a temp file first, then atomically rotates: current becomes `.bak`, temp becomes current.
5. The temporary VS Code settings directory is cleaned up locally.

### Pull flow (server mode)

1. The client downloads the tarball via `GET /sync` to a temp file in the target directory.
2. The tarball is verified by listing its entries (integrity check).
3. The tarball is extracted into the target directory (current directory by default, or the path specified by `--target`).
4. If `--only` is specified, only entries matching the given top-level types (e.g. `agents`, `skills`) are extracted; all others are skipped.
5. Temp files are cleaned up.

### Pull flow (--from repo mode)

1. The client verifies that `git` is installed.
2. A shallow clone (`--depth 1`) of the specified repository is created in a temporary directory.
3. The `.github/` directory is located in the cloned repo. If it does not exist, the operation fails with an error.
4. Content directories (`agents/`, `skills/`, `prompts/`, `hooks/`) are copied directly from `.github/` to the target directory with no format conversion. Skills are copied as subdirectories; other content types are copied as individual files (README.md files are skipped).
5. If `--only` is specified, only the listed content types are copied.
6. The temporary clone is cleaned up.

### VS Code Settings Handling

- **JSONC support**: VS Code `settings.json` may contain comments (`//`, `/* */`) and trailing commas. The client strips these before parsing.
- **Key-level merge**: Only keys matching these prefixes are touched: `github.copilot`, `chat.promptFilesLocations`, `chat.instructionsFilesLocations`, `chat.agent`. All other settings are preserved.
- **Comments are stripped on merge**: Because JSON does not support comments, any comments in the original `settings.json` will be lost in the copilot-key region after a pull/merge. Non-copilot portions are rewritten without comments as well (this is a known limitation of the JSON round-trip).
- **Cross-platform path detection**: The client auto-detects the `settings.json` location on macOS (`~/Library/Application Support/Code/User/settings.json`), Windows (`%APPDATA%/Code/User/settings.json`), and Linux (`~/.config/Code/User/settings.json`).

### Allowlist Approach

Rather than syncing everything in `~/.copilot/`, the tool uses an explicit allowlist of files and directories. This avoids syncing caches, logs, sessions, and other ephemeral data that should remain machine-local.

## Security Notes

- **API key authentication**: All endpoints except `/health` require a `Bearer` token matching the `GHCP_SYNC_KEY` environment variable.
- **Timing-safe comparison**: The server uses `crypto.timingSafeEqual` to prevent timing attacks on the API key.
- **No TLS by default**: The server listens on plain HTTP. For production use, place it behind a reverse proxy with TLS (e.g., nginx, Caddy) or use an SSH tunnel.
- **Shared secret**: The same `GHCP_SYNC_KEY` value must be set on both server and client. Treat it like a password.
- **Data directory permissions**: The tarball is stored in `./data/` (configurable). Ensure appropriate filesystem permissions.

## Windows Setup

On Windows, paths use the standard `%APPDATA%` location for VS Code settings. The client works the same way:

```powershell
$env:GHCP_SYNC_URL = "http://your-server:3457"
$env:GHCP_SYNC_KEY = "your-shared-secret"
node dist/client/cli.js push
node dist/client/cli.js pull
```

To run the server as a Windows service, use tools like [nssm](https://nssm.cc/) or [pm2](https://pm2.keymetrics.io/).

## Troubleshooting

### `ECONNREFUSED` when pushing/pulling

The server is not running or not reachable at the configured `GHCP_SYNC_URL`. Verify the server is started and the URL/port are correct.

### `401 Unauthorized`

The `GHCP_SYNC_KEY` on the client does not match the server. Ensure both sides use the same value.

### `No config stored yet. Push first.`

The server has no tarball. Run `ghcp-sync push` from a machine that has the config you want to sync.

### VS Code settings not merging

- Ensure VS Code is installed and `settings.json` exists at the expected path.
- The client will print a warning if it cannot find or parse the settings file.
- If the file has syntax errors beyond standard JSONC (comments + trailing commas), the parser may fail.

### `No Copilot config found to sync`

Neither `~/.copilot/` files nor VS Code copilot settings were found. Ensure at least one of these exists before pushing.

### Large tarball or unexpected files

Check that `node_modules`, `dist`, `.git`, `logs`, `sessions`, and `cache` directories aren't nested inside `~/.copilot/agents/`, `~/.copilot/hooks/`, `~/.copilot/skills/`, or `~/.copilot/prompts/`. These are excluded by the filter, but parent directories containing them will still be traversed.

## License

MIT -- see [LICENSE](LICENSE).
