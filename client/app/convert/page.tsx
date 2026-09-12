"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, X, AlertTriangle, Lock } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PairConnector from "../components/PairConnector";
import { useConversion } from "../context/ConversionContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Compound extensions (two dots) need special handling — the naive
// split(".").pop() approach returns "gz" for "archive.tar.gz", losing the
// "tar." part. Mirrors the same COMPOUND_EXTENSIONS check already done
// server-side in the /upload route, for the same reason.
const COMPOUND_EXTENSIONS = [".tar.gz"];

function extOf(file: File) {
  const lowerName = file.name.toLowerCase();
  const matchedCompound = COMPOUND_EXTENSIONS.find((c) =>
    lowerName.endsWith(c),
  );
  if (matchedCompound) return matchedCompound.replace(/^\./, "");
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export default function ConversionWorkspacePage() {
  return (
    <Suspense>
      <ConversionWorkspace />
    </Suspense>
  );
}

function ConversionWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    files,
    presetTargetExt,
    addFiles,
    removeFile,
    setPresetTargetExt,
    recordFileNames,
    reset,
  } = useConversion();
  const inputRef = useRef<HTMLInputElement>(null);

  const [formats, setFormats] = useState<Record<string, string[]> | null>(null);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  // Query params from a Browse Formats / popular-pair click (?from=&to=)
  // pre-select a target even before a file is dropped. useSearchParams()'s
  // value is already available synchronously on first render, so this is
  // computed directly as lazy initial state rather than via a useEffect +
  // setState (which triggers an avoidable extra render and is exactly the
  // pattern React's "you-might-not-need-an-effect" rule flags). Only runs
  // once, at mount — intentionally not re-synced if the user later changes
  // the dropdown, so we don't fight their choice.
  const [selectedTarget, setSelectedTarget] = useState<string | null>(
    () => presetTargetExt ?? searchParams.get("to"),
  );
  const [submitState, setSubmitState] = useState<
    "idle" | "uploading" | "converting" | "error"
  >("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/formats`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then((data) => setFormats(data))
      .catch(() =>
        setFormatsError("Couldn't reach the conversion server. Is it running?"),
      );
  }, []);

  // The backend applies one sourceExt/targetExt to an entire batch — so
  // the batch's "source format" is whatever the FIRST file is. Any
  // later-added file with a different extension can't ride along in the
  // same /convert call, so we flag it rather than silently drop or break.
  const sourceExt = files.length > 0 ? extOf(files[0]) : null;
  const mismatchedFiles = useMemo(
    () => files.filter((f) => extOf(f) !== sourceExt),
    [files, sourceExt],
  );
  const validFiles = useMemo(
    () => files.filter((f) => extOf(f) === sourceExt),
    [files, sourceExt],
  );

  const targetOptions = sourceExt && formats ? (formats[sourceExt] ?? []) : [];
  const isUnsupportedSource =
    formats && sourceExt !== null && !(sourceExt in formats);

  const handleFilesAdded = (newFiles: File[]) => {
    addFiles(newFiles);
  };

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesAdded(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleConvert = async () => {
    if (validFiles.length === 0 || !sourceExt || !selectedTarget) return;
    setSubmitState("uploading");
    setSubmitError(null);

    try {
      const uploadedIds: string[] = [];
      const newFileNames: Record<string, string> = {};
      for (const file of validFiles) {
        const body = new FormData();
        body.append("file", file);
        const uploadRes = await fetch(`${API_URL}/upload`, {
          method: "POST",
          body,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok)
          throw new Error(
            uploadData.error || `Upload failed for ${file.name}.`,
          );
        uploadedIds.push(uploadData.fileId);
        newFileNames[uploadData.fileId] = file.name;
      }
      recordFileNames(newFileNames);

      setSubmitState("converting");
      const convertRes = await fetch(`${API_URL}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          uploadedIds.length > 1
            ? {
                fileIds: uploadedIds,
                sourceExt,
                targetExt: selectedTarget,
                fileNames: newFileNames,
              }
            : {
                fileId: uploadedIds[0],
                sourceExt,
                targetExt: selectedTarget,
                fileNames: newFileNames,
              },
        ),
      });
      const convertData = await convertRes.json();
      if (!convertRes.ok)
        throw new Error(convertData.error || "Conversion failed to start.");

      router.push(`/job/${convertData.jobId}`);
    } catch (err) {
      setSubmitState("error");
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  };

  const clearAll = useCallback(() => {
    reset();
    setSelectedTarget(null);
  }, [reset]);

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
            Conversion Workspace
          </h1>
        </div>

        {formatsError && (
          <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 flex items-center gap-3 text-sm font-body">
            <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
            {formatsError}
          </div>
        )}

        {files.length === 0 ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesAdded(Array.from(e.dataTransfer.files));
            }}
            className="rounded-md border-2 border-dashed border-graphite-light bg-paper-raised p-12 md:p-16 text-center flex flex-col items-center gap-4"
          >
            <div className="w-14 h-14 rounded-full bg-route/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-route" strokeWidth={2} />
            </div>
            <p className="font-body text-graphite">Drag files here, or</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm px-5 py-2.5 transition-colors duration-150"
            >
              Browse files
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={handleBrowse}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="font-body text-sm text-graphite">
                {validFiles.length} file{validFiles.length !== 1 ? "s" : ""}{" "}
                ready
                {sourceExt && (
                  <span className="ml-2 font-technical text-xs px-2 py-0.5 rounded-full bg-route/10 text-route">
                    Detected: .{sourceExt}
                  </span>
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
              {files.map((file, i) => {
                const mismatched = mismatchedFiles.includes(file);
                return (
                  <div
                    key={`${file.name}-${i}`}
                    className={`bg-paper-raised border rounded-md p-3 flex items-center justify-between gap-3 ${
                      mismatched ? "border-error/40" : "border-graphite-light"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-md bg-route/10 flex items-center justify-center">
                        <span className="font-technical text-[10px] uppercase text-route">
                          {extOf(file) || "?"}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-body text-sm text-ink truncate">
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-graphite font-technical">
                          <span>{formatBytes(file.size)}</span>
                          {mismatched && (
                            <span className="text-error">
                              Doesn&apos;t match .{sourceExt} — won&apos;t be
                              included
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${file.name}`}
                      className="shrink-0 text-graphite hover:text-error transition-colors p-1.5 rounded-full hover:bg-error-bg"
                    >
                      <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => inputRef.current?.click()}
                className="font-body text-sm text-route hover:text-route-hover text-left mt-1"
              >
                + Add more files
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                onChange={handleBrowse}
                className="hidden"
              />
            </div>

            {isUnsupportedSource && (
              <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 flex items-center gap-3 text-sm font-body">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
                {`.${sourceExt} isn't a format ConvertHub can convert from yet.`}
              </div>
            )}

            {!isUnsupportedSource && targetOptions.length > 0 && (
              <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex flex-col gap-3">
                <label className="font-body text-sm text-ink font-medium">
                  Convert to
                </label>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {targetOptions.map((ext) => {
                    const active = selectedTarget === ext;
                    return (
                      <button
                        key={ext}
                        onClick={() => setSelectedTarget(ext)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-md border font-technical text-sm uppercase transition-colors duration-150 ${
                          active
                            ? "border-route bg-route/10 text-route"
                            : "border-graphite-light text-graphite hover:border-route hover:text-route"
                        }`}
                      >
                        {sourceExt && <PairConnector />}
                        {ext}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {submitError && (
              <div className="bg-error-bg border border-error/30 text-error rounded-md p-4 text-sm font-body">
                {submitError}
              </div>
            )}

            <button
              onClick={handleConvert}
              disabled={
                !selectedTarget ||
                validFiles.length === 0 ||
                submitState === "uploading" ||
                submitState === "converting" ||
                !!isUnsupportedSource
              }
              className="w-full h-14 rounded-md font-display text-base font-semibold flex items-center justify-center gap-2 mt-1 transition-colors duration-150 disabled:bg-graphite-light disabled:text-graphite disabled:cursor-not-allowed bg-route text-on-route hover:bg-route-hover"
            >
              {submitState === "uploading" && "Uploading…"}
              {submitState === "converting" && "Starting conversion…"}
              {(submitState === "idle" || submitState === "error") &&
                (validFiles.length > 1
                  ? `Convert ${validFiles.length} files`
                  : "Convert")}
            </button>

            <div className="bg-paper-raised border border-graphite-light rounded-md p-4 flex gap-3">
              <Lock
                className="w-4 h-4 shrink-0 text-graphite mt-0.5"
                strokeWidth={2}
              />
              <p className="font-body text-xs text-graphite">
                Files are processed and automatically deleted after 1 hour. We
                never share your data.
              </p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
