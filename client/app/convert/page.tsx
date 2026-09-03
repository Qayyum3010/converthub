"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useConversion } from "../context/ConversionContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ConversionWorkspace() {
  const router = useRouter();
  const { file, presetTargetExt, setFile, setPresetTargetExt } =
    useConversion();

  const [formats, setFormats] = useState<Record<string, string[]> | null>(null);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(
    presetTargetExt,
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

  const sourceExt = file
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : null;
  const targetOptions = sourceExt && formats ? (formats[sourceExt] ?? []) : [];
  const isUnsupportedSource =
    formats && sourceExt !== null && !(sourceExt in formats);

  const handleConvert = async () => {
    if (!file || !sourceExt || !selectedTarget) return;
    setSubmitState("uploading");
    setSubmitError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const uploadRes = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Upload failed.");
      }

      setSubmitState("converting");
      const convertRes = await fetch(`${API_URL}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: uploadData.fileId,
          sourceExt,
          targetExt: selectedTarget,
        }),
      });
      const convertData = await convertRes.json();
      if (!convertRes.ok) {
        throw new Error(convertData.error || "Conversion failed to start.");
      }

      router.push(`/job/${convertData.jobId}`);
    } catch (err) {
      setSubmitState("error");
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  };

  const removeFile = () => {
    setFile(null);
    setPresetTargetExt(null);
    setSelectedTarget(null);
  };

  return (
    <>
      <Header />
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-sm md:px-md xl:px-xl py-md md:py-lg flex flex-col gap-md md:gap-lg">
        <div className="flex flex-col gap-xs md:gap-sm">
          <Link
            href="/"
            className="flex items-center gap-1 text-secondary hover:text-primary transition-colors w-fit font-label-sm text-sm"
          >
            <span className="material-symbols-outlined text-base">
              arrow_back
            </span>
            Back to Home
          </Link>
          <h1 className="font-headline-lg text-xl md:text-2xl xl:text-3xl text-on-background font-bold">
            Conversion Workspace
          </h1>
        </div>

        {formatsError && (
          <div className="bg-error-container border border-error text-on-error-container rounded-lg p-sm flex items-center gap-sm text-sm">
            <span className="material-symbols-outlined text-error">
              warning
            </span>
            {formatsError}
          </div>
        )}

        {!file ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg text-center flex flex-col items-center gap-sm">
            <p className="font-body-md text-on-surface-variant">
              No file selected yet.
            </p>
            <Link
              href="/"
              className="bg-primary-container text-white px-md py-xs rounded-lg font-label-sm font-medium hover:bg-primary transition-colors"
            >
              Choose a file on the Home screen
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-md md:gap-gutter">
            {/* Left column: main actions */}
            <div className="lg:col-span-8 flex flex-col gap-md">
              {/* File preview card */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm md:p-md shadow-[0_4px_12px_rgba(0,0,0,0.04)] flex items-center justify-between gap-xs md:gap-sm">
                <div className="flex items-center gap-xs md:gap-md min-w-0">
                  <div className="w-9 h-9 md:w-12 md:h-12 shrink-0 bg-primary-fixed text-on-primary-fixed rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-lg md:text-xl">
                      description
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-on-surface truncate">
                      {file.name}
                    </span>
                    <div className="flex items-center gap-xs text-secondary text-sm">
                      <span className="font-technical-mono">
                        {formatBytes(file.size)}
                      </span>
                      {isUnsupportedSource && (
                        <>
                          <span>•</span>
                          <span className="font-technical-mono text-error">
                            Unsupported format
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={removeFile}
                  aria-label="Remove file"
                  className="shrink-0 text-secondary hover:text-error transition-colors p-xs rounded-full hover:bg-surface-variant"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>

              {isUnsupportedSource && (
                <div className="bg-error-container border border-error text-on-error-container rounded-lg p-sm flex items-center gap-sm text-sm">
                  <span className="material-symbols-outlined text-error">
                    warning
                  </span>
                  {`.${sourceExt} isn't a format ConvertHub can convert from yet.`}
                </div>
              )}

              {/* Target format selector — real registry pairs only */}
              {!isUnsupportedSource && targetOptions.length > 0 && (
                <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-[0_4px_12px_rgba(0,0,0,0.04)] flex flex-col gap-sm">
                  <label className="font-label-sm text-on-surface font-semibold">
                    Convert to
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
                    {targetOptions.map((ext) => {
                      const active = selectedTarget === ext;
                      return (
                        <button
                          key={ext}
                          onClick={() => setSelectedTarget(ext)}
                          className={`flex flex-col items-center gap-xs p-sm rounded-lg border-2 transition-all ${
                            active
                              ? "border-primary bg-primary-fixed/20 text-on-surface"
                              : "border-outline-variant hover:border-primary hover:bg-surface-container text-secondary hover:text-on-surface"
                          }`}
                        >
                          <span className="material-symbols-outlined text-3xl">
                            description
                          </span>
                          <span className="font-technical-mono text-sm uppercase">
                            {ext}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {submitError && (
                <div className="bg-error-container border border-error text-on-error-container rounded-lg p-sm flex items-center gap-sm text-sm">
                  <span className="material-symbols-outlined text-error">
                    error
                  </span>
                  {submitError}
                </div>
              )}

              {/* Primary action */}
              <button
                onClick={handleConvert}
                disabled={
                  !selectedTarget ||
                  submitState === "uploading" ||
                  submitState === "converting" ||
                  !!isUnsupportedSource
                }
                className="w-full h-14 md:h-16 rounded-xl font-headline-md text-base md:text-lg flex items-center justify-center gap-sm mt-sm transition-all disabled:bg-surface-variant disabled:text-outline disabled:cursor-not-allowed disabled:shadow-none bg-primary text-on-primary hover:bg-primary-container shadow-[0_4px_12px_rgba(0,74,198,0.25)] active:scale-[0.99]"
              >
                {submitState === "uploading" && "Uploading…"}
                {submitState === "converting" && "Starting conversion…"}
                {(submitState === "idle" || submitState === "error") && (
                  <>
                    Convert
                    <span className="material-symbols-outlined">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Right column: info */}
            <aside className="lg:col-span-4 flex flex-col gap-md">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-[0_4px_12px_rgba(0,0,0,0.04)] flex flex-col gap-md">
                <h3 className="font-headline-md text-lg text-on-surface">
                  What happens next
                </h3>
                <div className="flex flex-col">
                  {[
                    {
                      icon: "cloud_upload",
                      label: "Upload",
                      desc: "Securely upload your file.",
                    },
                    {
                      icon: "sync",
                      label: "Convert",
                      desc: "We process your document format.",
                    },
                    {
                      icon: "download",
                      label: "Download",
                      desc: "Get your freshly converted file.",
                    },
                  ].map((step, i, arr) => (
                    <div key={step.label} className="flex gap-sm">
                      <div className="flex flex-col items-center">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
                          <span className="material-symbols-outlined text-lg">
                            {step.icon}
                          </span>
                        </div>
                        {i < arr.length - 1 && (
                          <div className="w-0.5 flex-1 min-h-[24px] bg-outline-variant my-1" />
                        )}
                      </div>
                      <div className={i < arr.length - 1 ? "pb-md" : ""}>
                        <span className="font-label-sm text-on-surface font-semibold block pt-1.5">
                          {step.label}
                        </span>
                        <p className="font-body-md text-sm text-secondary">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-md flex gap-sm border border-outline-variant">
                <span className="material-symbols-outlined text-secondary shrink-0">
                  lock
                </span>
                <p className="font-label-sm text-xs text-secondary">
                  Files are securely processed and automatically deleted after 1
                  hour. We never share your data.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
