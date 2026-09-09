"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type ConversionContextValue = {
  files: File[];
  presetTargetExt: string | null;
  fileNames: Record<string, string>;
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  setPresetTargetExt: (ext: string | null) => void;
  recordFileNames: (names: Record<string, string>) => void;
  reset: () => void;
};

const ConversionContext = createContext<ConversionContextValue | null>(null);

export function ConversionProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  const [presetTargetExt, setPresetTargetExt] = useState<string | null>(null);
  // Maps the backend-generated fileId -> the original filename the user
  // dropped in. Populated right after upload (see convert/page.tsx), read
  // back on the Job Status page so results can show real names instead of
  // the opaque fileId. Not cleared by removeFile/reset mid-workspace — only
  // ever grows during a single convert run, which is the only place it's
  // read from.
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  const addFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const recordFileNames = (names: Record<string, string>) => {
    setFileNames((prev) => ({ ...prev, ...names }));
  };

  const reset = () => {
    setFiles([]);
    setPresetTargetExt(null);
  };

  return (
    <ConversionContext.Provider
      value={{
        files,
        presetTargetExt,
        fileNames,
        setFiles,
        addFiles,
        removeFile,
        setPresetTargetExt,
        recordFileNames,
        reset,
      }}
    >
      {children}
    </ConversionContext.Provider>
  );
}

export function useConversion() {
  const ctx = useContext(ConversionContext);
  if (!ctx) {
    throw new Error("useConversion must be used within a ConversionProvider");
  }
  return ctx;
}