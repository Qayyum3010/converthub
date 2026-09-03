import Header from "./components/Header";
import Footer from "./components/Footer";
import UploadZone from "./components/UploadZone";

const popularConversions: { from: string; to: string }[] = [
  { from: "MD", to: "PDF" },
  { from: "DOCX", to: "PDF" },
  { from: "CSV", to: "JSON" },
  { from: "XLSX", to: "CSV" },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-grow w-full max-w-[1200px] mx-auto px-sm md:px-md xl:px-xl py-lg md:py-xl flex flex-col items-center">
        {/* Hero */}
        <div className="text-center mb-lg md:mb-xl w-full max-w-3xl">
          <h1 className="font-display-lg text-3xl md:text-5xl font-bold text-on-surface mb-sm leading-tight">
            Convert any file, instantly
          </h1>
          <p className="font-body-lg text-base md:text-lg text-on-surface-variant">
            Free, no sign-up, files deleted automatically after 1 hour.
          </p>
        </div>

        {/* Upload zone */}
        <UploadZone />

        {/* Popular conversions — real registry pairs only */}
        <div className="w-full max-w-4xl mb-lg md:mb-xl mt-lg md:mt-xl">
          <h3 className="font-label-sm text-xs md:text-sm text-on-surface-variant uppercase tracking-wider mb-sm text-center">
            Popular Conversions
          </h3>
          <div className="flex flex-wrap justify-center gap-xs md:gap-sm">
            {popularConversions.map((pair) => (
              <button
                key={`${pair.from}-${pair.to}`}
                className="flex items-center gap-1.5 bg-surface-container-low hover:bg-surface-container active:scale-95 px-sm md:px-md py-xs rounded-full border border-outline-variant transition-all duration-150 group"
              >
                <span className="font-technical-mono text-xs md:text-sm text-error">
                  {pair.from}
                </span>
                <span className="text-outline group-hover:text-on-surface group-hover:translate-x-0.5 transition-all duration-150">
                  →
                </span>
                <span className="font-technical-mono text-xs md:text-sm text-primary">
                  {pair.to}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* PDF Tools banner — real feature, qpdf-backed */}
        <div className="w-full max-w-4xl bg-secondary-container rounded-xl p-md md:p-lg flex flex-col md:flex-row items-center justify-between gap-sm border border-secondary-fixed-dim">
          <div className="flex items-center gap-sm text-center md:text-left flex-col md:flex-row">
            <div>
              <h3 className="font-headline-md text-lg md:text-2xl text-on-secondary-container font-semibold">
                Need more PDF power?
              </h3>
              <p className="font-body-md text-sm md:text-base text-on-secondary-container opacity-90">
                Merge, split, or compress PDF files quickly and easily.
              </p>
            </div>
          </div>
          <a
            href="/pdf-tools"
            className="bg-surface-container-lowest text-primary px-md md:px-lg py-xs md:py-sm rounded-lg font-label-sm font-medium hover:bg-surface-container-low transition-colors whitespace-nowrap shadow-sm border border-outline-variant w-full md:w-auto text-center"
          >
            Go to PDF Tools
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
