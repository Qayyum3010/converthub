"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const navLinks = [
  { href: "/", label: "Convert" },
  { href: "/formats", label: "Browse formats" },
  { href: "/pdf-tools", label: "PDF Tools" },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on route change, so navigating doesn't leave it
  // open behind the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile menu is open, so the page behind it
  // doesn't scroll along with the dropdown.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <nav
      className={`bg-paper border-b border-graphite-light sticky top-0 z-50 transition-shadow duration-300 ${
        scrolled ? "shadow-[0_2px_12px_rgba(0,0,0,0.06)]" : ""
      }`}
    >
      <div className="flex justify-between items-center w-full px-4 md:px-16 h-16 md:h-20 max-w-[1200px] mx-auto">
        <Link href="/" className="transition-opacity hover:opacity-80 shrink-0">
          <Logo className="scale-90 md:scale-100 origin-left" />
        </Link>

        {/* Desktop nav — hidden below md, where it would overflow */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative pb-1 text-base font-medium transition-colors duration-200 whitespace-nowrap font-body ${
                  active
                    ? "text-route font-semibold"
                    : "text-graphite hover:text-ink"
                }`}
              >
                {link.label}
                <span
                  className={`absolute left-0 -bottom-0.5 h-0.5 w-full bg-route rounded-full transition-transform duration-200 origin-left ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </Link>
            );
          })}
          <ThemeToggle />
        </div>

        {/* Mobile controls — theme toggle stays visible, nav links collapse
            behind a hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="p-2 -mr-2 rounded-md text-graphite hover:text-ink hover:bg-paper-raised transition-colors duration-150"
          >
            {menuOpen ? (
              <X className="w-5 h-5" strokeWidth={2} />
            ) : (
              <Menu className="w-5 h-5" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out border-t border-graphite-light ${
          menuOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0 border-t-0"
        }`}
      >
        <div className="flex flex-col px-4 py-2">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`py-3 text-base font-medium font-body border-b border-graphite-light last:border-b-0 transition-colors duration-150 ${
                  active ? "text-route font-semibold" : "text-graphite hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}