const fs = require("fs");
const os = require("os");
const path = require("path");
const { sweepExpiredJobs } = require("./jobStore");

const TEMP_DIR = path.join(os.tmpdir(), "converthub-uploads");
const parsedTtl = parseInt(process.env.FILE_TTL_MINUTES, 10);
const TTL_MS = (Number.isNaN(parsedTtl) ? 60 : parsedTtl) * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

/**
 * Deletes any file in TEMP_DIR whose mtime is older than TTL_MS.
 * Runs on a fixed interval via startCleanupJob(). Applies to both uploaded
 * source files and generated output files — everything in this directory
 * is ephemeral by design (see PROJECT_OVERVIEW.md — no accounts, no
 * persistent storage in v1).
 */
function sweepExpiredFiles() {
  let entries;
  try {
    entries = fs.readdirSync(TEMP_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return; // nothing uploaded yet, nothing to sweep
    throw err;
  }

  const now = Date.now();
  let deletedCount = 0;

  for (const entry of entries) {
    const fullPath = path.join(TEMP_DIR, entry);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      continue; // file vanished between readdir and stat, ignore
    }

    if (!stats.isFile()) continue;

    const age = now - stats.mtimeMs;
    if (age > TTL_MS) {
      try {
        fs.unlinkSync(fullPath);
        deletedCount++;
      } catch (err) {
        console.error(`Cleanup: failed to delete ${fullPath}:`, err.message);
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`Cleanup: removed ${deletedCount} expired file(s)`);
  }
}

/**
 * Runs both sweeps: expired output/upload files (TEMP_DIR, mtime-based) and
 * expired job records (in-memory Map in jobStore.js, updatedAt-based). Kept
 * on the same interval/cadence rather than two separate timers, since both
 * exist to bound resource growth over server uptime and there's no reason
 * for them to drift out of sync.
 */
function sweepAll() {
  sweepExpiredFiles();
  sweepExpiredJobs();
}

/**
 * Starts the recurring sweep. Call once at server startup.
 */
function startCleanupJob() {
  sweepAll(); // run once immediately on boot
  setInterval(sweepAll, SWEEP_INTERVAL_MS);
}

module.exports = { startCleanupJob, sweepExpiredFiles, TTL_MS };
