"use client";

import { useCallback, useRef, useState } from "react";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB — matches server/index.js

export default function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (file.size > MAX_FILE_SIZE) {
      setError(`"${file.name}" exceeds the 20MB limit.`);
      return;
    }

    setError(null);
    // TODO (Task 9): route to Conversion Workspace with the selected file
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div className="w-full max-w-4xl bg-surface-container-lowest rounded-xl border border-outline-variant shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-sm md:p-lg xl:p-xl">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full min-h-[220px] md:min-h-[320px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-md text-center cursor-pointer transition-colors duration-200 relative ${
          isDragging
            ? "bg-primary-fixed border-primary"
            : "bg-surface-bright border-outline-variant hover:bg-surface-container-low"
        }`}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          className="mb-sm md:mb-md text-primary"
          aria-hidden="true"
        >
          <path
            d="M24 6v22m0-22 8 8m-8-8-8 8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 30v6a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4v-6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <h2 className="font-headline-md text-lg md:text-2xl text-on-surface mb-1">
          Drag &amp; drop a file here
        </h2>
        <p className="font-body-md text-sm md:text-base text-on-surface-variant mb-sm md:mb-md">
          or click to browse from your computer
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="bg-primary-container text-white px-md md:px-lg py-xs md:py-sm rounded-lg font-label-sm font-medium hover:bg-primary active:scale-95 transition-all duration-150"
        >
          Select File
        </button>

        <p className="font-label-sm text-xs text-outline mt-sm">
          Max file size: 20MB
        </p>

        <input
          ref={inputRef}
          type="file"
          aria-label="Upload file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="mt-sm bg-error-container text-on-error-container rounded-lg px-sm py-xs text-sm flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="9"
              cy="9"
              r="8"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M9 5v5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="9" cy="12.5" r="0.9" fill="currentColor" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
