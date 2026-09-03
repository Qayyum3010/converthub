"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type ConversionContextValue = {
  file: File | null;
  presetTargetExt: string | null;
  setFile: (file: File | null) => void;
  setPresetTargetExt: (ext: string | null) => void;
  reset: () => void;
};

const ConversionContext = createContext<ConversionContextValue | null>(null);

export function ConversionProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [presetTargetExt, setPresetTargetExt] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPresetTargetExt(null);
  };

  return (
    <ConversionContext.Provider
      value={{ file, presetTargetExt, setFile, setPresetTargetExt, reset }}
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
