"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function AllConversions() {
  const [formats, setFormats] = useState<Record<string, string[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/formats`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setFormats(data))
      .catch(() =>
        setError("Couldn't reach the conversion server. Is it running?"),
      );
  }, []);

  const entries = useMemo(() => {
    if (!formats) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(formats)
      .filter(([from, targets]) => {
        if (!q) return true;
        if (from.toLowerCase().includes(q)) return true;
        return targets.some((t) => t.toLowerCase().includes(q));
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [formats, query]);

  return (
    <>
      <Header />
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-sm md:px-md xl:px-xl py-md md:py-lg flex flex-col gap-md">
        <div className="flex flex-col gap-xs md:gap-sm">
          <Link
            href="/"
            className="flex items-center gap-1 text-secondary hover:text-primary transition-colors w-fit font-label-sm text-sm"
          >
            <span className="material-symbols-outlined text-base">
              arrow_back
            </span>
            Back to Home
          </Link>
          <h1 className="font-headline-lg text-xl md:text-2xl xl:text-3xl text-on-background font-bold">
            All Conversions
          </h1>
          <p className="font-body-md text-sm md:text-base text-on-surface-variant">
            Every format pair ConvertHub currently supports.
          </p>
        </div>

        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary text-xl pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a format, e.g. csv, pdf, yaml…"
            className="w-full bg-surface-container-high border-0 rounded-full pl-12 pr-11 py-3 font-body-md text-sm md:text-base text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface p-1 rounded-full hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>

        {error && (
          <div className="bg-error-container border border-error text-on-error-container rounded-lg p-sm flex items-center gap-sm text-sm">
            <span className="material-symbols-outlined text-error">
              warning
            </span>
            {error}
          </div>
        )}

        {formats && entries.length === 0 && (
          <p className="font-body-md text-sm text-on-surface-variant">
            No matches for &ldquo;{query}&rdquo;.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-sm">
          {entries.map(([from, targets]) => (
            <div
              key={from}
              className="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm md:p-md flex flex-col gap-xs"
            >
              <span className="font-technical-mono text-sm md:text-base text-on-surface uppercase font-semibold">
                {from}
              </span>
              <div className="flex flex-wrap gap-xs">
                {targets.map((to) => (
                  <span
                    key={to}
                    className="flex items-center gap-1 bg-surface-container-low px-xs py-0.5 rounded-full border border-outline-variant text-xs md:text-sm"
                  >
                    <span className="text-outline">→</span>
                    <span className="font-technical-mono text-primary uppercase">
                      {to}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
