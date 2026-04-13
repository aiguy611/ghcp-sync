import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";
import {
  COPILOT_DIR,
  VSCODE_SETTINGS_TAR_PREFIX,
  COPILOT_SETTINGS_FILENAME,
  INCLUDED_FILES,
  INCLUDED_DIRS,
} from "../shared/config.js";
import { mergeCopilotSettings } from "./vscode.js";

const TEMP_TARBALL = path.join(COPILOT_DIR, ".sync-download.tar.gz");

export async function pull(serverUrl: string, apiKey: string): Promise<void> {
  // Ensure target directory exists
  fs.mkdirSync(COPILOT_DIR, { recursive: true, mode: 0o700 });

  // Step 1: Download tarball to temp file
  console.log("Downloading config from server...");
  await downloadTarball(serverUrl, apiKey);

  // Step 2: Verify tarball integrity
  console.log("Verifying tarball...");
  let entryCount = 0;
  try {
    await tar.list({
      file: TEMP_TARBALL,
      onReadEntry: () => {
        entryCount++;
      },
    });
  } catch (err) {
    fs.rmSync(TEMP_TARBALL, { force: true });
    throw new Error(`Downloaded tarball is corrupted: ${err}`);
  }
  console.log(`Tarball verified: ${entryCount} entries.`);

  // Step 3: Delete existing syncable dirs/files
  console.log("Cleaning existing config...");
  for (const dir of INCLUDED_DIRS) {
    const fullPath = path.join(COPILOT_DIR, dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
  for (const file of INCLUDED_FILES) {
    const fullPath = path.join(COPILOT_DIR, file);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { force: true });
    }
  }

  // Step 4: Extract tarball
  console.log("Extracting config...");
  await tar.extract({
    file: TEMP_TARBALL,
    cwd: COPILOT_DIR,
    preserveOwner: false,
  });

  // Step 5: Handle VS Code copilot settings
  const extractedSettingsDir = path.join(COPILOT_DIR, VSCODE_SETTINGS_TAR_PREFIX);
  const extractedSettingsFile = path.join(extractedSettingsDir, COPILOT_SETTINGS_FILENAME);
  if (fs.existsSync(extractedSettingsFile)) {
    try {
      const raw = fs.readFileSync(extractedSettingsFile, "utf-8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      mergeCopilotSettings(settings);
    } catch (err) {
      console.warn(`Warning: Could not process VS Code settings: ${err instanceof Error ? err.message : err}`);
    }
    fs.rmSync(extractedSettingsDir, { recursive: true, force: true });
  }

  // Step 6: Cleanup temp tarball
  fs.rmSync(TEMP_TARBALL, { force: true });

  console.log(`Pull complete. Extracted ${entryCount} entries to ${COPILOT_DIR}`);
}

function downloadTarball(serverUrl: string, apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL("/sync", serverUrl);
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: 120_000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        if (res.statusCode === 404) {
          reject(new Error("No config on server yet. Run `ghcp-sync push` first."));
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            reject(new Error(`Server returned ${res.statusCode}: ${body}`));
          });
          return;
        }

        const writeStream = fs.createWriteStream(TEMP_TARBALL);
        res.pipe(writeStream);

        writeStream.on("finish", resolve);
        writeStream.on("error", (err) => {
          fs.rmSync(TEMP_TARBALL, { force: true });
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Download timed out after 120 seconds"));
    });
    req.on("error", reject);
  });
}
