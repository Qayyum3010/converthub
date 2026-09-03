export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-surface-container-low border-t border-outline-variant mt-auto">
      <div className="w-full py-md px-sm md:px-xl flex flex-col md:flex-row justify-between items-center gap-sm max-w-[1200px] mx-auto">
        <div className="text-center md:text-left">
          <span className="font-headline-md text-lg font-bold text-on-surface block mb-1">
            ConvertHub
          </span>
          <p className="font-body-md text-sm text-on-surface-variant">
            © {year} ConvertHub. Files are deleted automatically after 1 hour.
          </p>
        </div>
      </div>
    </footer>
  );
}
