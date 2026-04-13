import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const COPILOT_DIR =
  process.env.COPILOT_HOME || path.join(os.homedir(), ".copilot");

// Prefix used inside the tarball for VS Code copilot settings
export const VSCODE_SETTINGS_TAR_PREFIX = "__vscode_settings";
export const COPILOT_SETTINGS_FILENAME = "copilot-settings.json";

// Root-level files in ~/.copilot/ to sync
export const INCLUDED_FILES = [
  "config.json",
  "copilot-instructions.md",
];

// Full directories in ~/.copilot/ to sync (recursively)
export const INCLUDED_DIRS = [
  "agents",
  "hooks",
  "skills",
  "prompts",
];

// Patterns to exclude within included directories
export const GLOBAL_EXCLUDE_PATTERNS = [
  "node_modules",
  "dist",
  ".git",
  "logs",
  "sessions",
  "cache",
];

// Filter function for tar: returns true to INCLUDE, false to EXCLUDE
// NOTE: tar library always uses "/" as separator regardless of OS
export function tarFilter(filePath: string): boolean {
  const parts = filePath.split("/");
  for (const pattern of GLOBAL_EXCLUDE_PATTERNS) {
    if (parts.includes(pattern)) return false;
  }
  return true;
}

// Build the complete list of entries to include in the tarball
// All paths are relative to COPILOT_DIR
export function buildFileList(): string[] {
  const entries: string[] = [];

  for (const file of INCLUDED_FILES) {
    if (fs.existsSync(path.join(COPILOT_DIR, file))) {
      entries.push(file);
    }
  }

  for (const dir of INCLUDED_DIRS) {
    if (fs.existsSync(path.join(COPILOT_DIR, dir))) {
      entries.push(dir);
    }
  }

  return entries;
}

// Cross-platform VS Code user settings.json path
export function getVSCodeSettingsPath(): string | null {
  let settingsPath: string;

  switch (process.platform) {
    case "darwin":
      settingsPath = path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Code",
        "User",
        "settings.json"
      );
      break;
    case "win32":
      settingsPath = path.join(
        process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
        "Code",
        "User",
        "settings.json"
      );
      break;
    default: // linux
      settingsPath = path.join(
        os.homedir(),
        ".config",
        "Code",
        "User",
        "settings.json"
      );
      break;
  }

  return fs.existsSync(settingsPath) ? settingsPath : null;
}

// Prefixes for copilot-related VS Code settings keys
export const COPILOT_SETTING_PREFIXES = [
  "github.copilot",
  "chat.promptFilesLocations",
  "chat.instructionsFilesLocations",
  "chat.agent",
];

// Check if a VS Code settings key is copilot-related
export function isCopilotKey(key: string): boolean {
  return COPILOT_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix));
}
