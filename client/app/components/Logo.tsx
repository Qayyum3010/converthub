export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* A routing jack/plug motif: two ports connected by a single
            patch cable, grounding the mark in the "routing panel"
            concept rather than a generic conversion-arrow icon. */}
        <rect x="1.5" y="6" width="9" height="9" rx="1.5" className="stroke-route" strokeWidth="2" fill="none" />
        <rect x="19.5" y="15" width="9" height="9" rx="1.5" className="stroke-route" strokeWidth="2" fill="none" />
        <path
          d="M10.5 10.5 C17 10.5, 13 19.5, 19.5 19.5"
          className="stroke-route"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="6" cy="10.5" r="1.5" className="fill-route" />
        <circle cx="24" cy="19.5" r="1.5" className="fill-route" />
      </svg>
      <span className="font-display text-2xl font-semibold text-ink tracking-tight">
        ConvertHub
      </span>
    </div>
  );
}