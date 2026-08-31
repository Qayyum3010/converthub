// jobRunner.js
// Wraps conversion jobs with a per-type timeout tier and a global
// concurrency cap, so every Task 5 handler plugs into the same
// tested mechanism instead of reinventing it per-handler.

let queueInstance = null;

// Global concurrency cap — container-wide limit on simultaneous
// conversion jobs, regardless of type. Prevents e.g. 50 concurrent
// LibreOffice/TeX Live jobs from exhausting container memory/CPU.
const MAX_CONCURRENT_JOBS = 4;

// Timeout tiers (ms) — matched to PROJECT_OVERVIEW.md's framing:
// LaTeX/OCR need meaningfully longer allowances than simple conversions.
const TIMEOUT_TIERS = {
  fast: 10_000, // CSV/JSON/XML/YAML/TOML, simple data-format conversions
  medium: 30_000, // Pandoc, LibreOffice general document conversions
  slow: 120_000, // LaTeX (TeX Live), OCR (Tesseract)
};

async function getQueue() {
  if (!queueInstance) {
    const { default: PQueue } = await import("p-queue");
    queueInstance = new PQueue({ concurrency: MAX_CONCURRENT_JOBS });
  }
  return queueInstance;
}

class JobTimeoutError extends Error {
  constructor(tier, ms) {
    super(`Job timed out after ${ms}ms (tier: ${tier})`);
    this.name = "JobTimeoutError";
    this.tier = tier;
  }
}

/**
 * Runs `jobFn` under the global concurrency cap, enforcing a timeout
 * based on `tier` ("fast" | "medium" | "slow").
 *
 * @param {Function} jobFn - async function performing the actual conversion
 * @param {"fast"|"medium"|"slow"} tier - determines the timeout allowance
 * @returns {Promise<any>} - resolves with jobFn's result, rejects on timeout/error
 */
async function runJob(jobFn, tier = "medium") {
  const timeoutMs = TIMEOUT_TIERS[tier];
  if (!timeoutMs) {
    throw new Error(`Unknown timeout tier: ${tier}`);
  }

  const queue = await getQueue();

  return queue.add(() => {
    return Promise.race([
      jobFn(),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new JobTimeoutError(tier, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  });
}

module.exports = {
  runJob,
  JobTimeoutError,
  TIMEOUT_TIERS,
  MAX_CONCURRENT_JOBS,
};
