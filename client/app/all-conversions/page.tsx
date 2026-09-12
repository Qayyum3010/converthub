import { redirect } from "next/navigation";

// /all-conversions was the original read-only format-lookup page, later
// superseded by /formats (same data, but with real navigation into
// /convert — see DECISIONS.md, 2026-09-03). Kept as a redirect rather than
// a 404 in case it's bookmarked or linked anywhere external.
export default function AllConversionsRedirect() {
  redirect("/formats");
}