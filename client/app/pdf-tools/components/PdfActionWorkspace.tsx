"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  Download,
  Lock,
  ArrowUp,
  ArrowDown,
  LucideIcon,
} from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL_MS = 1500;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sanitizeFilenamePart(name: string) {
  return name.replace(/["\r\n/\\]/g, "_");
}

function stripPdfExt(name: string) {
  return name.replace(/\.pdf$/i, "");
}

// Builds the filename the *downloaded* file should have, based on what the
// user actually uploaded/requested — not the internal fileId/jobId.
function buildDownloadFilename(
  tool: PdfTool,
  files: File[],
  pageRange: string,
): string {
  if (tool === "merge") {
    const parts = files.map((f) => stripPdfExt(f.name));
    return sanitizeFilenamePart(`${parts.join(" + ")}.pdf`);
  }
  if (tool === "split") {
    const base = stripPdfExt(files[0]?.name ?? "document");
    const pagesLabel = pageRange.replace(/,/g, "_").replace(/-/g, "to");
    return sanitizeFilenamePart(`${base}-pages-${pagesLabel}.pdf`);
  }
  // compress (single file)
  const base = stripPdfExt(files[0]?.name ?? "document");
  return sanitizeFilenamePart(`${base}-compressed.pdf`);
}

export type PdfTool = "merge" | "split" | "compress";

type ToolConfig = {
  title: string;
  description: string;
  icon: LucideIcon;
  minFiles: number;
  maxFiles: number;
  multiple: boolean;
  reorder: boolean;
  needsPageRange: boolean;
  actionLabel: (n: number) => string;
};

export default function PdfActionWorkspace({
  tool,
  config,
}: {
  tool: PdfTool;
  config: ToolConfig;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = config.icon;

  const [files, setFiles] = useState<File[]>([]);
  const [pageRange, setPageRange] = useState("");
  const [rejectedNames, setRejectedNames] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<
    "idle" | "uploading" | "processing" | "done" | "error"
  >("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>("");
  // Batch case (compress with multiple files): jobId -> desired filename,
  // passed to /download/:jobId?names= as a JSON map.
  const [batchNameMap, setBatchNameMap] = useState<Record<string, string> | null>(
    null,
  );

  const addFiles = (incoming: File[]) => {
    const pdfs = incoming.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const rejected = incoming.filter((f) => !f.name.toLowerCase().endsWith(".pdf"));
    if (rejected.length > 0) {
      setRejectedNames(rejected.map((f) => f.name));
    } else {
      setRejectedNames([]);
    }
    setFiles((prev) => {
      const room = config.maxFiles - prev.length;
      return [...prev, ...pdfs.slice(0, Math.max(room, 0))];
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Used by both "Convert another file" (success) and to fully reset after
  // a failure if the user wants to start over rather than retry in place.
  const clearAll = () => {
    setFiles([]);
    setPageRange("");
    setRejectedNames([]);
    setSubmitState("idle");
    setSubmitError(null);
    setCurrentJobId(null);
    setDownloadFilename("");
    setBatchNameMap(null);
  };

  const canSubmit =
    files.length >= config.minFiles &&
    files.length <= config.maxFiles &&
    (!config.needsPageRange ||
      (pageRange.trim().length > 0 && !/\s/.test(pageRange))) &&
    (submitState === "idle" || submitState === "error");

  const pollJob = async (jobId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/job/${jobId}`);
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || "Job lookup failed.");

    if (job.status === "done") {
      // Batch result (compress with multiple files): build a fileId -> name
      // map in the same order the files were submitted, so each output gets
      // its original name back instead of a raw internal id.
      if (Array.isArray(job.result?.files)) {
        const nameMap: Record<string, string> = {};
        job.result.files.forEach(
          (f: { fileId: string; status: string }, i: number) => {
            if (f.status === "done") {
              nameMap[f.fileId] = sanitizeFilenamePart(
                `${stripPdfExt(files[i]?.name ?? `file-${i + 1}`)}-compressed.pdf`,
              );
            }
          },
        );
        setBatchNameMap(nameMap);
      } else {
        setDownloadFilename(buildDownloadFilename(tool, files, pageRange));
      }
      setSubmitState("done");
      return;
    }
    if (job.status === "failed") {
      throw new Error(job.error || `${config.title} failed.`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    return pollJob(jobId);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitState("uploading");
    setSubmitError(null);

    try {
      const uploadedIds: string[] = [];
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        const uploadRes = await fetch(`${API_URL}/upload`, {
          method: "POST",
          body,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || `Upload failed for ${file.name}.`);
        }
        uploadedIds.push(uploadData.fileId);
      }

      setSubmitState("processing");

      const endpoint =
        tool === "merge"
          ? "/pdf/merge"
          : tool === "split"
            ? "/pdf/split"
            : "/pdf/compress";

      const payload =
        tool === "merge"
          ? { fileIds: uploadedIds }
          : tool === "split"
            ? { fileId: uploadedIds[0], pageRange: pageRange.replace(/\s+/g, "") }
            : uploadedIds.length > 1
              ? { fileIds: uploadedIds }
              : { fileId: uploadedIds[0] };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${config.title} failed to start.`);

      setCurrentJobId(data.jobId);
      await pollJob(data.jobId);
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const downloadHref = currentJobId
    ? batchNameMap
      ? `${API_URL}/download/${currentJobId}?names=${encodeURIComponent(
          JSON.stringify(batchNameMap),
        )}`
      : `${API_URL}/download/${currentJobId}?filename=${encodeURIComponent(
          downloadFilename,
        )}`
    : "";

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 md:px-16 py-8 md:py-12 flex flex-col gap-6 md:gap-10">
        <div className="flex flex-col gap-2">
          <Link
            href="/pdf-tools"
            className="flex items-center gap-1.5 text-graphite hover:text-route transition-colors w-fit font-body text-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            Back to PDF Tools
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-route/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-route" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl text-ink font-semibold">
                {config.title}
              </h1>
              <p className="font-body text-sm text-graphite">{config.description}</p>
            </div>
          </div>
        </div>

        {rejectedNames.length > 0 && (
          <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 flex items-center gap-3 text-sm font-body">
            <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
            {`Only PDF files are supported — skipped: ${rejectedNames.join(", ")}`}
          </div>
        )}

        {submitState === "done" ? (
          <div className="flex flex-col gap-4">
            <div className="bg-route/10 border border-route/30 text-route rounded-md p-4 flex items-center gap-3 text-sm font-body">
              <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2} />
              {config.title} complete.
            </div>
            
            <a  href={downloadHref}
              className="w-full h-14 rounded-md font-display text-base font-semibold flex items-center justify-center gap-2 bg-route text-on-route hover:bg-route-hover transition-colors duration-150"
            >
              <Download className="w-4 h-4" strokeWidth={2} />
              Download
            </a>
            <button
              onClick={clearAll}
              className="font-body text-sm text-route hover:text-route-hover text-left"
            >
              ← Convert another file
            </button>
          </div>
        ) : (
          <>
            {files.length === 0 ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="rounded-md border-2 border-dashed border-graphite-light bg-paper-raised p-12 md:p-16 text-center flex flex-col items-center gap-4"
              >
                <div className="w-14 h-14 rounded-full bg-route/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-route" strokeWidth={2} />
                </div>
                <p className="font-body text-graphite">
                  {config.multiple ? "Drag PDF files here, or" : "Drag a PDF here, or"}
                </p>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm px-5 py-2.5 transition-colors duration-150"
                >
                  Browse files
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple={config.multiple}
                  onChange={handleBrowse}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="font-body text-sm text-graphite">
                    {files.length} file{files.length !== 1 ? "s" : ""} ready
                    {config.minFiles > 1 && files.length < config.minFiles && (
                      <span className="text-error"> — need at least {config.minFiles}</span>
                    )}
                  </p>
                  <button
                    onClick={clearAll}
                    className="font-body text-sm text-graphite hover:text-error transition-colors"
                  >
                    Clear all
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {files.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="bg-paper-raised border border-graphite-light rounded-md p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {config.reorder && (
                          <span className="font-technical text-xs text-graphite w-5 shrink-0 text-center">
                            {i + 1}
                          </span>
                        )}
                        <div className="w-9 h-9 shrink-0 rounded-md bg-route/10 flex items-center justify-center">
                          <span className="font-technical text-[10px] uppercase text-route">
                            pdf
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-body text-sm text-ink truncate">{file.name}</span>
                          <span className="text-xs text-graphite font-technical">
                            {formatBytes(file.size)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {config.reorder && (
                          <>
                            <button
                              onClick={() => moveFile(i, -1)}
                              disabled={i === 0}
                              aria-label={`Move ${file.name} up`}
                              className="text-graphite hover:text-route transition-colors p-1.5 rounded-full hover:bg-route/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-graphite"
                            >
                              <ArrowUp className="w-4 h-4" strokeWidth={2} />
                            </button>
                            <button
                              onClick={() => moveFile(i, 1)}
                              disabled={i === files.length - 1}
                              aria-label={`Move ${file.name} down`}
                              className="text-graphite hover:text-route transition-colors p-1.5 rounded-full hover:bg-route/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-graphite"
                            >
                              <ArrowDown className="w-4 h-4" strokeWidth={2} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => removeFile(i)}
                          aria-label={`Remove ${file.name}`}
                          className="text-graphite hover:text-error transition-colors p-1.5 rounded-full hover:bg-error-bg"
                        >
                          <X className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {files.length < config.maxFiles && (
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="font-body text-sm text-route hover:text-route-hover text-left mt-1"
                    >
                      + Add {files.length > 0 ? "more" : "a"} file{config.multiple ? "s" : ""}
                    </button>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple={config.multiple}
                    onChange={handleBrowse}
                    className="hidden"
                  />
                </div>

                {config.needsPageRange && (
                  <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col gap-2">
                    <label
                      htmlFor="page-range"
                      className="font-body text-sm text-ink font-medium"
                    >
                      Pages to extract
                    </label>
                    <input
                      id="page-range"
                      type="text"
                      value={pageRange}
                      onChange={(e) => setPageRange(e.target.value)}
                      placeholder="e.g. 1-3, 1,4,7, or 2-z (no spaces)"
                      className="rounded-md border border-graphite-light bg-paper px-3 py-2.5 font-technical text-sm text-ink focus:outline-none focus:border-route transition-colors"
                    />
                    <p className="font-body text-xs text-graphite">
                      Comma-separated pages or ranges, no spaces. Use &quot;z&quot; for the last page.
                    </p>
                    {/\s/.test(pageRange) && (
                      <p className="font-body text-xs text-error">
                        Remove the spaces — use &quot;1,4,7&quot; instead of &quot;1, 4, 7&quot;.
                      </p>
                    )}
                  </div>
                )}

                {submitError && (
                  <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 text-sm font-body">
                    {submitError}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full h-14 rounded-md font-display text-base font-semibold flex items-center justify-center gap-2 mt-1 transition-colors duration-150 disabled:bg-graphite-light disabled:text-graphite disabled:cursor-not-allowed bg-route text-on-route hover:bg-route-hover"
                >
                  {submitState === "uploading" && "Uploading…"}
                  {submitState === "processing" && "Starting…"}
                  {submitState === "idle" && config.actionLabel(files.length)}
                  {submitState === "error" && "Try again"}
                </button>

                <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex gap-3">
                  <Lock className="w-4 h-4 shrink-0 text-graphite mt-0.5" strokeWidth={2} />
                  <p className="font-body text-xs text-graphite">
                    Files are processed and automatically deleted after 1 hour. We never share your data.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}