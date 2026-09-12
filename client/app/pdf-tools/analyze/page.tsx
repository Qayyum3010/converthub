"use client";

import { BarChart3 } from "lucide-react";
import PdfReportWorkspace from "../components/PdfReportWorkspace";

export default function AnalyzePdfPage() {
  return (
    <PdfReportWorkspace
      tool="analyze"
      config={{
        title: "Analyze & Inspect",
        description: "Deep dive into a PDF's metadata, structure, and fonts.",
        icon: BarChart3,
      }}
    />
  );
}