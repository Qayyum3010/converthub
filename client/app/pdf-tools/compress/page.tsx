"use client";

import { Minimize2 } from "lucide-react";
import PdfActionWorkspace from "../components/PdfActionWorkspace";

export default function CompressPdfPage() {
  return (
    <PdfActionWorkspace
      tool="compress"
      config={{
        title: "Compress PDF",
        description: "Shrink file size while keeping your PDF readable.",
        icon: Minimize2,
        minFiles: 1,
        maxFiles: 10,
        multiple: true,
        reorder: false,
        needsPageRange: false,
        actionLabel: (n) => (n > 1 ? `Compress ${n} files` : "Compress PDF"),
      }}
    />
  );
}