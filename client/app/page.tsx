"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FolderOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import Header from "./components/Header";
import Footer from "./components/Footer";
import PairConnector from "./components/PairConnector";
import { useConversion } from "./context/ConversionContext";

const POPULAR_PAIRS: { from: string; to: string }[] = [
  { from: "docx", to: "pdf" },
  { from: "png", to: "webp" },
  { from: "mp3", to: "wav" },
  { from: "csv", to: "xlsx" },
  { from: "heic", to: "jpg" },
  { from: "md", to: "docx" },
];

export default function Home() {
  const router = useRouter();
  const { addFiles, setPresetTargetExt } = useConversion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const goToWorkspace = useCallback(
    (files: File[], presetTarget?: string) => {
      if (files.length === 0) return;
      addFiles(files);
      setPresetTargetExt(presetTarget ?? null);
      router.push("/convert");
    },
    [addFiles, setPresetTargetExt, router],
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    goToWorkspace(dropped);
  };

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    goToWorkspace(selected);
  };

  const handlePairClick = (pair: { from: string; to: string }) => {
    // No file yet — send the person straight to the workspace with the
    // target pre-selected; they'll drop a matching file once there.
    setPresetTargetExt(pair.to);
    router.push(`/convert?from=${pair.from}&to=${pair.to}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />

      <main className="flex-1">
        <section className="max-w-[1200px] mx-auto px-4 md:px-16 pt-16 md:pt-24 pb-12 md:pb-16 text-center">
          <h1 className="font-display text-4xl md:text-6xl font-semibold text-ink leading-tight tracking-tight text-balance">
            Convert almost anything
          </h1>
          <p className="mt-4 font-body text-base md:text-lg text-graphite max-w-[36rem] w-full mx-auto">
            200+ formats, no sign-up, no file-limit games. Drop a file and
            we&apos;ll figure out where it can go.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-10 mx-auto max-w-2xl rounded-md border-2 border-dashed transition-colors duration-200 px-6 py-14 md:py-16 flex flex-col items-center gap-4 ${
              isDragging
                ? "border-route bg-route/5"
                : "border-graphite-light bg-paper-raised"
            }`}
          >
            <div className="w-14 h-14 rounded-full bg-route/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-route" strokeWidth={2} />
            </div>
            <div>
              <p className="font-body font-medium text-ink">
                Drag files here, or
              </p>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-route hover:bg-route-hover text-on-route font-body font-medium text-sm px-5 py-2.5 transition-colors duration-150"
            >
              <FolderOpen className="w-4 h-4" strokeWidth={2} />
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
        </section>

        <section className="max-w-[1200px] mx-auto px-4 md:px-16 pb-16 md:pb-20">
          <p className="font-body text-sm text-graphite mb-4 text-center">
            Popular conversions
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {POPULAR_PAIRS.map((pair) => (
              <button
                key={`${pair.from}-${pair.to}`}
                onClick={() => handlePairClick(pair)}
                className="inline-flex items-center gap-2 rounded-md border border-graphite-light bg-paper-raised px-4 py-2.5 font-technical text-sm text-ink hover:border-route hover:text-route transition-colors duration-150"
              >
                <span className="uppercase">{pair.from}</span>
                <PairConnector />
                <span className="uppercase">{pair.to}</span>
              </button>
            ))}
            <Link
              href="/formats"
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 font-body text-sm font-medium text-route hover:text-route-hover transition-colors duration-150"
            >
              See all formats
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

