"use client";

import { Layers } from "lucide-react";
import PdfActionWorkspace from "../components/PdfActionWorkspace";

export default function MergePdfPage() {
  return (
    <PdfActionWorkspace
      tool="merge"
      config={{
        title: "Merge PDFs",
        description: "Combine multiple PDFs into one document, in the order you arrange them.",
        icon: Layers,
        minFiles: 2,
        maxFiles: 10,
        multiple: true,
        reorder: true,
        needsPageRange: false,
        actionLabel: (n) => `Merge ${n} file${n !== 1 ? "s" : ""}`,
      }}
    />
  );
}