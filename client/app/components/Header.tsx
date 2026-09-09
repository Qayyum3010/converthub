"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

        <div className="flex items-center gap-4 md:gap-6">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative pb-1 text-sm md:text-base font-medium transition-colors duration-200 whitespace-nowrap font-body ${
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
      </div>
    </nav>
  );
}