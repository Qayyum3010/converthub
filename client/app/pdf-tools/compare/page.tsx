"use client";

import { GitCompare } from "lucide-react";
import PdfReportWorkspace from "../components/PdfReportWorkspace";

export default function ComparePdfPage() {
  return (
    <PdfReportWorkspace
      tool="compare"
      config={{
        title: "Compare PDFs",
        description: "Line-by-line text comparison between two PDF documents.",
        icon: GitCompare,
      }}
    />
  );
}