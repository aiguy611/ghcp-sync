import fs from "node:fs";
import { getVSCodeSettingsPath, isCopilotKey } from "../shared/config.js";

// Strip JSON comments (// and /* */) and trailing commas for JSONC compatibility
function stripJsonComments(text: string): string {
  // Remove single-line comments (but not inside strings)
  // This is a simplified approach that works for typical VS Code settings
  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === "\\") escape = true;
      if (ch === '"') inString = false;
      result += ch;
      continue;
    }

    // Not in a string
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      // Skip until end of line
      while (i < text.length && text[i] !== "\n") i++;
      result += "\n";
      continue;
    }

    if (ch === "/" && next === "*") {
      // Skip until */
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++; // skip the /
      continue;
    }

    result += ch;
  }

  // Remove trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, "$1");
}

// Extract copilot-related keys from VS Code user settings.json
export function extractCopilotSettings(): Record<string, unknown> | null {
  const settingsPath = getVSCodeSettingsPath();
  if (!settingsPath) return null;

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const cleaned = stripJsonComments(raw);
    const settings = JSON.parse(cleaned) as Record<string, unknown>;

    const copilotSettings: Record<string, unknown> = {};
    for (const key of Object.keys(settings)) {
      if (isCopilotKey(key)) {
        copilotSettings[key] = settings[key];
      }
    }

    if (Object.keys(copilotSettings).length === 0) return null;
    return copilotSettings;
  } catch (err) {
    console.warn(`Warning: Could not read VS Code settings: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Merge copilot settings into VS Code user settings.json
export function mergeCopilotSettings(incoming: Record<string, unknown>): void {
  const settingsPath = getVSCodeSettingsPath();
  if (!settingsPath) {
    console.warn("Warning: VS Code not found. Skipping VS Code settings merge.");
    return;
  }

  try {
    let settings: Record<string, unknown> = {};

    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf-8");
      const cleaned = stripJsonComments(raw);
      settings = JSON.parse(cleaned) as Record<string, unknown>;
    }

    // Remove existing copilot keys
    for (const key of Object.keys(settings)) {
      if (isCopilotKey(key)) {
        delete settings[key];
      }
    }

    // Add incoming copilot keys
    Object.assign(settings, incoming);

    // Write back
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4) + "\n", "utf-8");
    console.log(`Merged ${Object.keys(incoming).length} copilot settings into VS Code.`);
  } catch (err) {
    console.warn(`Warning: Could not merge VS Code settings: ${err instanceof Error ? err.message : err}`);
  }
}
