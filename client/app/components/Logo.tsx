export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Two arced arrows forming a conversion loop */}
        <path
          d="M9 11 A9 9 0 0 1 23 8.5"
          stroke="#004AC6"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M19 5 L23 8.5 L18.5 11"
          stroke="#004AC6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M23 21 A9 9 0 0 1 9 23.5"
          stroke="#2563EB"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M13 27 L9 23.5 L13.5 21"
          stroke="#2563EB"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span className="font-headline-md text-2xl font-bold text-primary tracking-tight">
        ConvertHub
      </span>
    </div>
  );
}
