"use client";

import { Split } from "lucide-react";
import PdfActionWorkspace from "../components/PdfActionWorkspace";

export default function SplitPdfPage() {
  return (
    <PdfActionWorkspace
      tool="split"
      config={{
        title: "Split PDF",
        description: "Extract specific pages or a range into a new PDF.",
        icon: Split,
        minFiles: 1,
        maxFiles: 1,
        multiple: false,
        reorder: false,
        needsPageRange: true,
        actionLabel: () => "Split PDF",
      }}
    />
  );
}