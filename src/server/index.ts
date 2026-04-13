import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PORT = parseInt(process.env.GHCP_SYNC_PORT || "3457", 10);
const DATA_DIR = process.env.GHCP_SYNC_DATA_DIR || "./data";
const API_KEY = process.env.GHCP_SYNC_KEY;

if (!API_KEY) {
  console.error("GHCP_SYNC_KEY environment variable is required");
  process.exit(1);
}

const CONFIG_FILE = path.join(DATA_DIR, "copilot-config.tar.gz");
const TEMP_FILE = path.join(DATA_DIR, "copilot-config.tar.gz.tmp");
const BACKUP_FILE = path.join(DATA_DIR, "copilot-config.tar.gz.bak");

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();

// Timing-safe auth comparison
function isValidAuth(header: string | undefined): boolean {
  if (!header) return false;
  const expected = `Bearer ${API_KEY}`;
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(header),
    Buffer.from(expected)
  );
}

// Auth middleware (skip for /health)
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!isValidAuth(req.headers.authorization)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
});

// Health check
app.get("/health", (_req, res) => {
  let hasConfig = false;
  let configSize = 0;
  try {
    const stat = fs.statSync(CONFIG_FILE);
    hasConfig = true;
    configSize = stat.size;
  } catch {
    // file doesn't exist
  }
  res.json({ ok: true, hasConfig, configSize });
});

// Pull: stream tarball to client
app.get("/sync", (_req, res) => {
  if (!fs.existsSync(CONFIG_FILE)) {
    res.status(404).json({ ok: false, error: "No config stored yet. Push first." });
    return;
  }
  const stat = fs.statSync(CONFIG_FILE);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Length", stat.size);
  fs.createReadStream(CONFIG_FILE).pipe(res);
});

// Push: stream tarball from client to disk
app.put("/sync", (req, res) => {
  const writeStream = fs.createWriteStream(TEMP_FILE);

  req.pipe(writeStream);

  writeStream.on("finish", () => {
    try {
      const stat = fs.statSync(TEMP_FILE);
      // Rotate: current -> backup, temp -> current
      if (fs.existsSync(CONFIG_FILE)) {
        fs.renameSync(CONFIG_FILE, BACKUP_FILE);
      }
      fs.renameSync(TEMP_FILE, CONFIG_FILE);
      res.json({ ok: true, bytes: stat.size });
    } catch (err) {
      console.error("Error finalizing upload:", err);
      try { fs.unlinkSync(TEMP_FILE); } catch { /* ignore */ }
      res.status(500).json({ ok: false, error: "Failed to store config" });
    }
  });

  writeStream.on("error", (err) => {
    console.error("Error writing upload:", err);
    try { fs.unlinkSync(TEMP_FILE); } catch { /* ignore */ }
    res.status(500).json({ ok: false, error: "Upload failed" });
  });

  req.on("error", (err) => {
    console.error("Request stream error:", err);
    writeStream.destroy();
    try { fs.unlinkSync(TEMP_FILE); } catch { /* ignore */ }
  });
});

app.listen(PORT, () => {
  console.log(`ghcp-sync server listening on port ${PORT}`);
  console.log(`Data directory: ${path.resolve(DATA_DIR)}`);
});
