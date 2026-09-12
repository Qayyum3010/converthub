export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-paper-raised border-t border-graphite-light mt-auto">
      <div className="w-full py-6 md:py-8 px-4 md:px-16 flex flex-col items-center gap-1 max-w-[1200px] mx-auto text-center">
        <span className="font-display text-base md:text-lg font-bold text-ink">
          ConvertHub
        </span>
        <p className="font-body text-xs md:text-sm text-graphite">
          © {year} ConvertHub. Files are deleted automatically after 1 hour.
        </p>
      </div>
    </footer>
  );
}