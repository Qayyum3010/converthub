// jobStore.js
// In-memory job tracking for async conversion/PDF-tool requests. Single
// Map, single Render instance — matches the same v1 scope decision already
// logged for rate limiting (see DECISIONS.md, Task 7 entry). Swap for a
// shared store (Redis/etc.) if v2 adds horizontal scaling; keep this
// module's function signatures as the seam for that swap.

const crypto = require("crypto");

// TTL for a completed/failed job's *record* (not the output file itself —
// file cleanup is a separate concern, wired in a later Task 7 subtask).
// Keeps the in-memory Map from growing unbounded over server uptime.
const JOB_RECORD_TTL_MS = 30 * 60 * 1000; // 30 minutes

const jobs = new Map();

/**
 * Creates a new job record in "queued" status.
 * @returns {string} jobId
 */
function createJob() {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    jobId,
    status: "queued", // queued -> processing -> done | failed
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return jobId;
}

/**
 * Marks a job as processing. Called right before the actual work starts.
 * @param {string} jobId
 */
function markProcessing(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "processing";
  job.updatedAt = Date.now();
}

/**
 * Marks a job done with its result payload.
 * @param {string} jobId
 * @param {object} result - whatever the route would have returned inline before
 */
function markDone(jobId, result) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "done";
  job.result = result;
  job.updatedAt = Date.now();
}

/**
 * Marks a job failed with a clear error message.
 * @param {string} jobId
 * @param {string} message
 */
function markFailed(jobId, message) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "failed";
  job.error = message;
  job.updatedAt = Date.now();
}

/**
 * Retrieves a job record, or null if it doesn't exist (never existed, or
 * already expired/cleaned up).
 * @param {string} jobId
 * @returns {object|null}
 */
function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Sweeps job records older than JOB_RECORD_TTL_MS. Only removes done/failed
 * jobs — a "processing" job past TTL is a stuck/slow job, not an expired
 * one, and shouldn't silently disappear from under a client still polling it.
 * Intended to be called on an interval (wired in a later subtask alongside
 * output-file TTL cleanup, so both run on the same cadence).
 */
function sweepExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (
      (job.status === "done" || job.status === "failed") &&
      now - job.updatedAt > JOB_RECORD_TTL_MS
    ) {
      jobs.delete(jobId);
    }
  }
}

module.exports = {
  createJob,
  markProcessing,
  markDone,
  markFailed,
  getJob,
  sweepExpiredJobs,
  JOB_RECORD_TTL_MS,
};
