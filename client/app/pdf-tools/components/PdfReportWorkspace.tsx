"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  Type,
  Sparkles,
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

type AnalyzeResult = {
  pageCount: number;
  pdfVersion: string | null;
  encrypted: boolean;
  linearized: boolean;
  embeddedFonts: string[];
  text: string;
  author: string | null;
  title: string | null;
  createdDate: string | null;
  ocrUsed: boolean;
  keywords: string[];
};

type CompareResult = {
  identical: boolean;
  similarity: number;
  diff: { type: "unchanged" | "added" | "removed"; lines: string[] }[];
};

type ReportTool = "analyze" | "compare";

type ToolConfig = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function PdfReportWorkspace({
  tool,
  config,
}: {
  tool: ReportTool;
  config: ToolConfig;
}) {
  const isCompare = tool === "compare";
  const inputRefA = useRef<HTMLInputElement>(null);
  const inputRefB = useRef<HTMLInputElement>(null);
  const Icon = config.icon;

  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [state, setState] = useState<
    "idle" | "uploading" | "processing" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  const validate = (f: File) => f.name.toLowerCase().endsWith(".pdf");

  const pickFile = (incoming: File | undefined, slot: "A" | "B") => {
    if (!incoming) return;
    if (!validate(incoming)) {
      setRejected(incoming.name);
      return;
    }
    setRejected(null);
    if (slot === "A") setFileA(incoming);
    else setFileB(incoming);
  };

  const canSubmit = isCompare ? !!fileA && !!fileB : !!fileA;

  const reset = () => {
    setFileA(null);
    setFileB(null);
    setState("idle");
    setError(null);
    setAnalyzeResult(null);
    setCompareResult(null);
  };

  useEffect(() => {
    return () => {
      // no-op cleanup placeholder; polling loop below manages its own timer
    };
  }, []);

  const pollJob = async (jobId: string) => {
    const poll = async (): Promise<void> => {
      const res = await fetch(`${API_URL}/job/${jobId}`);
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || "Job lookup failed.");

      if (job.status === "done") {
        if (isCompare) setCompareResult(job.result);
        else setAnalyzeResult(job.result);
        setState("done");
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.error || `${config.title} failed.`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      return poll();
    };
    await poll();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setState("uploading");
    setError(null);

    try {
      const uploadOne = async (file: File) => {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch(`${API_URL}/upload`, { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Upload failed for ${file.name}.`);
        return data.fileId as string;
      };

      const idA = await uploadOne(fileA as File);
      const idB = isCompare ? await uploadOne(fileB as File) : null;

      setState("processing");

      const endpoint = isCompare ? "/pdf/compare" : "/pdf/analyze";
      const payload = isCompare
        ? { fileIdA: idA, fileIdB: idB }
        : { fileId: idA };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${config.title} failed to start.`);

      await pollJob(data.jobId);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

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

        {rejected && (
          <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 flex items-center gap-3 text-sm font-body">
            <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
            {`"${rejected}" isn't a PDF — only .pdf files are supported here.`}
          </div>
        )}

        {state !== "done" && (
          <div className={`grid ${isCompare ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"} gap-4`}>
            {(isCompare ? (["A", "B"] as const) : (["A"] as const)).map((slot) => {
              const file = slot === "A" ? fileA : fileB;
              const ref = slot === "A" ? inputRefA : inputRefB;
              return (
                <div
                  key={slot}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    pickFile(e.dataTransfer.files?.[0], slot);
                  }}
                  className="rounded-md border-2 border-dashed border-graphite-light bg-paper-raised p-8 md:p-10 text-center flex flex-col items-center gap-3"
                >
                  {isCompare && (
                    <span className="font-technical text-xs uppercase text-graphite">
                      Document {slot}
                    </span>
                  )}
                  {file ? (
                    <div className="w-full flex items-center justify-between gap-3 bg-paper border border-graphite-light rounded-md p-3">
                      <div className="flex flex-col min-w-0 text-left">
                        <span className="font-body text-sm text-ink truncate">{file.name}</span>
                        <span className="text-xs text-graphite font-technical">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                      <button
                        onClick={() => (slot === "A" ? setFileA(null) : setFileB(null))}
                        aria-label={`Remove ${file.name}`}
                        className="shrink-0 text-graphite hover:text-error transition-colors p-1.5 rounded-full hover:bg-error-bg"
                      >
                        <X className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-route/10 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-route" strokeWidth={2} />
                      </div>
                      <p className="font-body text-sm text-graphite">Drag a PDF here, or</p>
                      <button
                        onClick={() => ref.current?.click()}
                        className="inline-flex items-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm px-4 py-2 transition-colors duration-150"
                      >
                        Browse
                      </button>
                    </>
                  )}
                  <input
                    ref={ref}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      pickFile(e.target.files?.[0], slot);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 text-sm font-body">
            {error}
          </div>
        )}

        {state !== "done" && (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || state === "uploading" || state === "processing"}
            className="w-full h-14 rounded-md font-display text-base font-semibold flex items-center justify-center gap-2 transition-colors duration-150 disabled:bg-graphite-light disabled:text-graphite disabled:cursor-not-allowed bg-route text-on-route hover:bg-route-hover"
          >
            {state === "uploading" && "Uploading…"}
            {state === "processing" && `Running ${config.title.toLowerCase()}…`}
            {(state === "idle" || state === "error") && config.title}
          </button>
        )}

        {state === "done" && analyzeResult && (
          <AnalyzeReport result={analyzeResult} fileName={fileA?.name ?? "Document"} onReset={reset} />
        )}
        {state === "done" && compareResult && (
          <CompareReport result={compareResult} nameA={fileA?.name ?? "Document A"} nameB={fileB?.name ?? "Document B"} onReset={reset} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function AnalyzeReport({
  result,
  fileName,
  onReset,
}: {
  result: AnalyzeResult;
  fileName: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-route/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-route" strokeWidth={2} />
          </div>
          <h2 className="font-display text-lg text-ink font-semibold truncate">{fileName}</h2>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-route/10 text-route rounded-full font-technical text-xs shrink-0 w-fit">
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
          Analysis complete
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col">
          <div className="flex items-center gap-2 text-graphite mb-3">
            <Info className="w-4 h-4" strokeWidth={2} />
            <h3 className="font-technical text-xs uppercase tracking-wider">Document Stats</h3>
          </div>
          <dl className="flex flex-col">
            {[
              ["Pages", result.pageCount],
              ["PDF Version", result.pdfVersion ?? "Unknown"],
              ["Fast Web View", result.linearized ? "Yes" : "No"],
              ["Encryption", result.encrypted ? "Encrypted" : "None"],
              ["Text via OCR", result.ocrUsed ? "Yes (scanned doc)" : "No"],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="flex justify-between items-center py-2 border-b border-graphite-light last:border-0"
              >
                <dt className="font-body text-sm text-graphite">{label}</dt>
                <dd className="font-technical text-sm text-ink font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col">
          <div className="flex items-center gap-2 text-graphite mb-3">
            <Info className="w-4 h-4" strokeWidth={2} />
            <h3 className="font-technical text-xs uppercase tracking-wider">Metadata</h3>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="font-body text-xs text-graphite">Title</div>
              <div className="font-technical text-sm text-ink truncate">{result.title || "—"}</div>
            </div>
            <div>
              <div className="font-body text-xs text-graphite">Author</div>
              <div className="font-technical text-sm text-ink truncate">{result.author || "—"}</div>
            </div>
            <div>
              <div className="font-body text-xs text-graphite">Created</div>
              <div className="font-technical text-sm text-ink truncate">{result.createdDate || "—"}</div>
            </div>
          </div>
        </div>

        <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col md:col-span-2">
          <div className="flex items-center gap-2 text-graphite mb-3">
            <Type className="w-4 h-4" strokeWidth={2} />
            <h3 className="font-technical text-xs uppercase tracking-wider">Embedded Fonts</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.embeddedFonts.length === 0 ? (
              <span className="font-body text-sm text-graphite">No embedded fonts detected.</span>
            ) : (
              result.embeddedFonts.map((font) => (
                <span
                  key={font}
                  className="px-2.5 py-1 bg-paper rounded-md border border-graphite-light font-technical text-xs text-ink"
                >
                  {font}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col md:col-span-2">
          <div className="flex items-center gap-2 text-graphite mb-3">
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            <h3 className="font-technical text-xs uppercase tracking-wider">Top Keywords</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.keywords.length === 0 ? (
              <span className="font-body text-sm text-graphite">Not enough text to extract keywords.</span>
            ) : (
              result.keywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2.5 py-1 bg-route/10 text-route rounded-full font-technical text-xs"
                >
                  {kw}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onReset}
        className="font-body text-sm text-route hover:text-route-hover text-left"
      >
        ← Analyze another PDF
      </button>
    </div>
  );
}

function CompareReport({
  result,
  nameA,
  nameB,
  onReset,
}: {
  result: CompareResult;
  nameA: string;
  nameB: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className={`rounded-md border p-4 flex items-center justify-between gap-3 font-body text-sm ${
          result.identical
            ? "bg-route/10 border-route/30 text-route"
            : "bg-paper-raised border-graphite-light text-ink"
        }`}
      >
        <div className="flex items-center gap-3">
          {result.identical ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2} />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-error" strokeWidth={2} />
          )}
          {result.identical
            ? "These documents contain identical text."
            : "These documents differ."}
        </div>
        <span className="font-technical text-xs px-2.5 py-1 rounded-full bg-route/10 text-route shrink-0">
          {result.similarity}% similar
        </span>
      </div>

      {!result.identical && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(["A", "B"] as const).map((side) => (
            <div
              key={side}
              className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col"
            >
              <div className="font-technical text-xs uppercase tracking-wider text-graphite mb-3 truncate">
                {side === "A" ? nameA : nameB}
              </div>
              <div className="max-h-[32rem] overflow-y-auto flex flex-col gap-0.5 font-technical text-xs">
                {result.diff.map((block, i) => {
                  // Panel A shows unchanged + removed (skips added, since
                  // those lines don't exist in A). Panel B shows unchanged +
                  // added (skips removed, since those lines don't exist in B).
                  if (side === "A" && block.type === "added") return null;
                  if (side === "B" && block.type === "removed") return null;

                  const isUnchanged = block.type === "unchanged";
                  const lines =
                    isUnchanged && block.lines.length > 6
                      ? [
                          ...block.lines.slice(0, 2),
                          `… ${block.lines.length - 4} unchanged lines …`,
                          ...block.lines.slice(-2),
                        ]
                      : block.lines;

                  const bgClass = isUnchanged
                    ? "bg-route/10 text-route"
                    : side === "A"
                      ? "bg-error-bg text-error"
                      : "bg-blue-100 text-blue-700";

                  return lines.map((line, j) => (
                    <div
                      key={`${i}-${j}`}
                      className={`px-2 py-0.5 whitespace-pre-wrap rounded ${bgClass}`}
                    >
                      {line}
                    </div>
                  ));
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onReset}
        className="font-body text-sm text-route hover:text-route-hover text-left"
      >
        ← Compare different files
      </button>
    </div>
  );
}