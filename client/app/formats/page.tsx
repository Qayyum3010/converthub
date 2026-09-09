"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PairConnector from "../components/PairConnector";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const FAMILY_ORDER = ["Documents", "Images", "Audio", "Data", "Archives", "Ebooks"] as const;

const FAMILY_MAP: Record<string, (typeof FAMILY_ORDER)[number]> = {
  md: "Documents", html: "Documents", adoc: "Documents", rst: "Documents",
  txt: "Documents", rtf: "Documents", odt: "Documents", docx: "Documents",
  doc: "Documents", tex: "Documents", bib: "Documents", ipynb: "Documents",
  pdf: "Documents", xlsx: "Documents", xls: "Documents", ods: "Documents",
  pptx: "Documents", ppt: "Documents", odp: "Documents",
  jpg: "Images", png: "Images", webp: "Images", gif: "Images",
  tiff: "Images", avif: "Images", heic: "Images", svg: "Images",
  mp3: "Audio", wav: "Audio", ogg: "Audio", flac: "Audio",
  m4a: "Audio", aac: "Audio",
  csv: "Data", json: "Data", yaml: "Data", xml: "Data", toml: "Data",
  zip: "Archives", "7z": "Archives", tar: "Archives", "tar.gz": "Archives",
  rar: "Archives", iso: "Archives",
  epub: "Ebooks",
};

export default function BrowseFormats() {
  const router = useRouter();
  const [formats, setFormats] = useState<Record<string, string[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/formats`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then((data) => setFormats(data))
      .catch(() =>
        setError("Couldn't reach the conversion server. Is it running?"),
      );
  }, []);

  const totalPairs = useMemo(() => {
    if (!formats) return 0;
    return Object.values(formats).reduce((sum, targets) => sum + targets.length, 0);
  }, [formats]);

  const grouped = useMemo(() => {
    if (!formats) return null;
    const q = query.trim().toLowerCase();

    const result: Record<string, { source: string; targets: string[] }[]> = {};
    for (const family of FAMILY_ORDER) result[family] = [];

    for (const [source, targets] of Object.entries(formats)) {
      const family = FAMILY_MAP[source] ?? "Documents";
      if (!q) {
        result[family].push({ source, targets });
        continue;
      }
      const sourceMatches = source.includes(q);
      const matchingTargets = sourceMatches
        ? targets
        : targets.filter((t) => t.includes(q));
      if (matchingTargets.length > 0) {
        result[family].push({ source, targets: matchingTargets });
      }
    }

    for (const family of FAMILY_ORDER) {
      result[family].sort((a, b) => a.source.localeCompare(b.source));
    }

    return result;
  }, [formats, query]);

  const handlePairClick = (from: string, to: string) => {
    router.push(`/convert?from=${from}&to=${to}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />

      <main className="flex-1">
        <section className="max-w-[1200px] mx-auto px-4 md:px-16 pt-12 md:pt-16 pb-8">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">
            Browse all formats
          </h1>
          <p className="mt-2 font-body text-graphite">
            {formats ? `${totalPairs} conversion pairs across ${Object.keys(formats).length} formats.` : "Loading the current format list..."}
          </p>

          <div className="mt-6 relative max-w-[28rem] w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-graphite" strokeWidth={2} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search formats, e.g. pdf, mp3, docx..."
              className="w-full rounded-md border border-graphite-light bg-paper-raised pl-10 pr-4 py-2.5 font-body text-sm text-ink placeholder:text-graphite focus:outline-none focus:border-route transition-colors duration-150"
            />
          </div>
        </section>

        {error && (
          <p className="max-w-[1200px] mx-auto px-4 md:px-16 font-body text-error">{error}</p>
        )}

        {grouped && (
          <section className="max-w-[1200px] mx-auto px-4 md:px-16 pb-20 flex flex-col gap-12">
            {FAMILY_ORDER.filter((family) => grouped[family].length > 0).map((family) => (
              <div key={family}>
                <h2 className="font-display text-xl font-semibold text-ink mb-4 pb-2 border-b border-graphite-light">
                  {family}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[family].map(({ source, targets }) => (
                    <div
                      key={source}
                      className="rounded-md border border-graphite-light bg-paper-raised p-4"
                    >
                      <p className="font-technical text-sm font-medium text-ink uppercase mb-3">
                        {source}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {targets.map((target) => (
                          <button
                            key={target}
                            onClick={() => handlePairClick(source, target)}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-graphite-light px-2.5 py-1 font-technical text-xs text-graphite hover:border-route hover:text-route transition-colors duration-150"
                          >
                            <PairConnector />
                            <span className="uppercase">{target}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {Object.values(grouped).every((list) => list.length === 0) && query && (
              <p className="font-body text-graphite text-center py-12">
                No formats match &ldquo;{query}&rdquo;.
              </p>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}