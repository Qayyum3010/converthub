"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  AlertTriangle,
} from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { useConversion } from "../../context/ConversionContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL_MS = 1500;

type BatchFileResult = {
  fileId: string;
  targetExt?: string;
  status: "done" | "failed";
  error?: string;
};

type JobResult =
  | { fileId: string; outputPath: string; targetExt: string } // single-file
  | { files: BatchFileResult[]; allSucceeded: boolean }; // batch

type Job = {
  jobId: string;
  status: "queued" | "processing" | "done" | "failed";
  result: JobResult | null;
  error: string | null;
};

// Compound extensions (two dots) need special handling — same issue as
// extOf() in convert/page.tsx and COMPOUND_EXTENSIONS in the server's
// /upload route: naive lastIndexOf(".") strips only "gz" from
// "base.tar.gz", leaving "base.tar" instead of "base".
const COMPOUND_EXTENSIONS = [".tar.gz"];

// The original uploaded filename keeps its source extension (e.g. "notes.md"),
// but the ready-to-download file has been converted to targetExt. Swap the
// extension for display so the UI shows "notes.pdf" rather than "notes.md".
function withTargetExt(originalName: string, targetExt: string): string {
  const lowerName = originalName.toLowerCase();
  const matchedCompound = COMPOUND_EXTENSIONS.find((c) => lowerName.endsWith(c));
  const base = matchedCompound
    ? originalName.slice(0, originalName.length - matchedCompound.length)
    : (() => {
        const lastDot = originalName.lastIndexOf(".");
        return lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
      })();
  return `${base}.${targetExt}`;
}

function isBatchResult(
  result: JobResult
): result is { files: BatchFileResult[]; allSucceeded: boolean } {
  return "files" in result;
}

export default function JobStatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const { fileNames } = useConversion();

  const [job, setJob] = useState<Job | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${API_URL}/job/${jobId}`);

        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }

        if (res.status === 429) {
          // Rate-limited — the server tells us exactly how long to back
          // off. Retrying on the normal 1.5s cadence here just re-trips
          // the limiter and prolongs the wait, so honor retryAfter instead.
          const body = await res.json().catch(() => null);
          const retryAfterSeconds =
            typeof body?.retryAfter === "number" ? body.retryAfter : 5;
          if (cancelled) return;
          setPollError(
            `Polling too fast — waiting ${retryAfterSeconds}s before retrying.`
          );
          timerRef.current = setTimeout(poll, retryAfterSeconds * 1000);
          return;
        }

        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data: Job = await res.json();
        if (cancelled) return;

        setJob(data);
        setPollError(null);

        if (data.status === "queued" || data.status === "processing") {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setPollError(
          err instanceof Error
            ? err.message
            : "Couldn't reach the conversion server."
        );
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);

  const isWorking =
    job && (job.status === "queued" || job.status === "processing");
  const isFailed = job?.status === "failed";
  const isDone = job?.status === "done";

  const batch =
    isDone && job.result && isBatchResult(job.result) ? job.result : null;
  const successCount = batch
    ? batch.files.filter((f) => f.status === "done").length
    : 0;
  const failCount = batch
    ? batch.files.filter((f) => f.status === "failed").length
    : 0;

  // Query param the server reads to name entries inside the batch ZIP with
  // the user's original filenames (extension swapped to targetExt) instead
  // of falling back to raw fileIds. Built only from files we actually have
  // a recorded name for — the server falls back per-entry when a fileId is
  // missing from this map.
  const batchNamesParam = batch
    ? encodeURIComponent(
        JSON.stringify(
          Object.fromEntries(
            batch.files
              .filter((f) => f.status === "done" && fileNames[f.fileId])
              .map((f) => [
                f.fileId,
                withTargetExt(fileNames[f.fileId], f.targetExt || "pdf"),
              ])
          )
        )
      )
    : "";

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 md:px-16 py-8 md:py-12 flex flex-col gap-6 md:gap-10">
        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-graphite hover:text-route transition-colors w-fit font-body text-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            Back to Home
          </Link>
          <h1 className="font-display text-2xl md:text-3xl text-ink font-semibold">
            Conversion Status
          </h1>
        </div>

        <div className="max-w-xl mx-auto w-full flex flex-col gap-4">
          {notFound && (
            <div className="bg-paper-raised border border-graphite-light rounded-md p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-error-bg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-error" strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-body text-ink font-medium">
                  We couldn&apos;t find this job.
                </p>
                <p className="font-body text-sm text-graphite">
                  It may have expired, or the link is incorrect.
                </p>
              </div>
              <button
                onClick={() => router.push("/convert")}
                className="inline-flex items-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm px-5 py-2.5 transition-colors duration-150"
              >
                Start a new conversion
              </button>
            </div>
          )}

          {!notFound && isWorking && (
            <div className="bg-paper-raised border border-graphite-light rounded-md p-8 flex flex-col items-center gap-4 text-center">
              <Loader2 className="w-8 h-8 text-route animate-spin" strokeWidth={2} />
              <div className="flex flex-col gap-1">
                <p className="font-body text-ink font-medium">
                  {job?.status === "queued" ? "Queued…" : "Converting your file…"}
                </p>
                <p className="font-body text-sm text-graphite">
                  This usually only takes a few seconds. This page will update
                  automatically — no need to refresh.
                </p>
              </div>
            </div>
          )}

          {!notFound && pollError && (
            <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 flex items-center gap-3 text-sm font-body">
              <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
              {pollError} — still trying in the background.
            </div>
          )}

          {!notFound && isFailed && (
            <div className="bg-paper-raised border border-graphite-light rounded-md p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-error-bg flex items-center justify-center">
                <XCircle className="w-6 h-6 text-error" strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-body text-ink font-medium">Conversion failed</p>
                <p className="font-body text-sm text-graphite">
                  {job?.error || "Something went wrong during conversion."}
                </p>
              </div>
              <button
                onClick={() => router.push("/convert")}
                className="inline-flex items-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm px-5 py-2.5 transition-colors duration-150"
              >
                Try again
              </button>
            </div>
          )}

          {!notFound && isDone && !batch && (
            <div className="bg-paper-raised border border-graphite-light rounded-md p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-route/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-route" strokeWidth={2} />
              </div>
              <p className="font-body text-ink font-medium">
                {job.result && !isBatchResult(job.result) && fileNames[job.result.fileId]
                  ? `"${withTargetExt(fileNames[job.result.fileId], job.result.targetExt)}" is ready`
                  : "Your file is ready"}
              </p>
              <a
                href={
                  job.result && !isBatchResult(job.result) && fileNames[job.result.fileId]
                    ? `${API_URL}/download/${jobId}?filename=${encodeURIComponent(
                        withTargetExt(fileNames[job.result.fileId], job.result.targetExt),
                      )}`
                    : `${API_URL}/download/${jobId}`
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm h-12 px-5 transition-colors duration-150"
              >
                <Download className="w-4 h-4" strokeWidth={2} />
                Download file
              </a>
              <button
                onClick={() => router.push("/convert")}
                className="font-body text-sm text-graphite hover:text-route transition-colors"
              >
                Convert another file
              </button>
            </div>
          )}

          {!notFound && isDone && batch && (
            <div className="bg-paper-raised border border-graphite-light rounded-md p-6 md:p-8 flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center ${
                    batch.allSucceeded ? "bg-route/10" : "bg-error-bg"
                  }`}
                >
                  {batch.allSucceeded ? (
                    <CheckCircle2 className="w-6 h-6 text-route" strokeWidth={2} />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-error" strokeWidth={2} />
                  )}
                </div>
                <p className="font-body text-ink font-medium">
                  {batch.allSucceeded
                    ? `All ${successCount} files converted`
                    : `${successCount} of ${successCount + failCount} files converted`}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {batch.files.map((f) => (
                  <div
                    key={f.fileId}
                    className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
                      f.status === "done"
                        ? "border-graphite-light"
                        : "border-error/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {f.status === "done" ? (
                        <CheckCircle2
                          className="w-4 h-4 shrink-0 text-route"
                          strokeWidth={2}
                        />
                      ) : (
                        <XCircle
                          className="w-4 h-4 shrink-0 text-error"
                          strokeWidth={2}
                        />
                      )}
                      <span className="font-body text-sm text-ink truncate">
                        {fileNames[f.fileId] && f.targetExt
                          ? withTargetExt(fileNames[f.fileId], f.targetExt)
                          : fileNames[f.fileId] || f.fileId}
                      </span>
                    </div>
                    {f.status === "failed" && f.error && (
                      <span className="font-body text-xs text-error text-right shrink-0">
                        {f.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {successCount > 0 && (
                <a
                  href={`${API_URL}/download/${jobId}${
                    batchNamesParam ? `?names=${batchNamesParam}` : ""
                  }`}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm h-12 px-5 transition-colors duration-150"
                >
                  <Download className="w-4 h-4" strokeWidth={2} />
                  Download{" "}
                  {successCount > 1 ? `${successCount} files as ZIP` : "file"}
                </a>
              )}

              <button
                onClick={() => router.push("/convert")}
                className="font-body text-sm text-graphite hover:text-route transition-colors self-center"
              >
                Convert another file
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}