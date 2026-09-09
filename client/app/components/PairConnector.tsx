/** The custom routing-panel connector glyph used wherever a format pair
 * is displayed, instead of a generic "→" character. */
export default function PairConnector() {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
      <circle cx="2" cy="5" r="1.5" className="fill-route" />
      <path d="M3.5 5 H10" className="stroke-route" strokeWidth="1.5" />
      <path
        d="M9 2 L12.5 5 L9 8"
        className="stroke-route"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}