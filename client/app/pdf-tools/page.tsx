"use client";

import Link from "next/link";
import { Layers, Split, Minimize2, GitCompare, BarChart3 } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

type Tool = {
  href: string;
  icon: typeof Layers;
  title: string;
  description: string;
  tags?: string[];
  wide?: boolean;
};

const TOOLS: Tool[] = [
  {
    href: "/pdf-tools/merge",
    icon: Layers,
    title: "Merge PDFs",
    description: "Combine multiple PDF files into a single document seamlessly.",
  },
  {
    href: "/pdf-tools/split",
    icon: Split,
    title: "Split PDF",
    description: "Extract pages or divide a large PDF into smaller, manageable files.",
  },
  {
    href: "/pdf-tools/compress",
    icon: Minimize2,
    title: "Compress PDF",
    description: "Reduce file size without losing quality for easier sharing.",
  },
  {
    href: "/pdf-tools/compare",
    icon: GitCompare,
    title: "Compare PDFs",
    description: "Visually compare two PDF documents side-by-side to find differences.",
  },
  {
    href: "/pdf-tools/analyze",
    icon: BarChart3,
    title: "Analyze & Inspect",
    description:
      "Deep dive into PDF metadata, structure, and font usage. Perfect for print prep and troubleshooting complex documents.",
    tags: ["Metadata", "Fonts", "Security"],
    wide: true,
  },
];

export default function PdfToolsHub() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />

      <main className="flex-1">
        <section className="max-w-[1200px] mx-auto px-4 md:px-16 pt-12 md:pt-16 pb-6">
          <h1 className="font-display text-3xl md:text-5xl font-semibold text-ink leading-tight tracking-tight">
            PDF Tools
          </h1>
          <p className="mt-3 font-body text-base md:text-lg text-graphite max-w-2xl">
            Merge, split, compress, compare, and inspect PDFs. Powerful
            utilities designed for maximum speed and simplicity.
          </p>
        </section>

        <section className="max-w-[1200px] mx-auto px-4 md:px-16 pb-16 md:pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`group relative overflow-hidden rounded-md border border-graphite-light bg-paper-raised p-6 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-route hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.12)] ${
                    tool.wide ? "lg:col-span-2" : ""
                  }`}
                >
                  <Icon
                    className="absolute -right-4 -top-4 w-28 h-28 text-route opacity-[0.06] group-hover:opacity-[0.1] transition-opacity duration-200"
                    strokeWidth={1.5}
                  />

                  <div
                    className={`relative z-10 flex ${
                      tool.wide ? "flex-col md:flex-row md:items-start gap-4" : "flex-col"
                    }`}
                  >
                    <div className="w-11 h-11 shrink-0 rounded-md bg-route/10 flex items-center justify-center mb-4 md:mb-4 group-hover:bg-route/20 transition-colors duration-200">
                      <Icon className="w-5 h-5 text-route" strokeWidth={2} />
                    </div>

                    <div>
                      <h3 className="font-display text-xl font-semibold text-ink mb-1.5">
                        {tool.title}
                      </h3>
                      <p className="font-body text-sm text-graphite">
                        {tool.description}
                      </p>

                      {tool.tags && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {tool.tags.map((tag) => (
                            <span
                              key={tag}
                              className="font-technical text-xs text-graphite bg-paper px-2 py-1 rounded-full border border-graphite-light"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}