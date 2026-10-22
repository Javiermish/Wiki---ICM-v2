import { BookOpen } from "lucide-react";
import Link from "next/link";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const navigationLinks = [
  { href: "/#explorar", label: "Explorar" },
  { href: "/#materiales", label: "Materiales" },
  { href: "/#comunidad", label: "Comunidad" },
  { href: "/aportar", label: "Aportar" },
] as const;

export function SiteHeader() {
  return (
    <header className="relative border-b border-border bg-background">
      <div className="page-container flex min-h-20 items-center justify-between gap-3 py-3">
        <Link
          href="/"
          aria-label="Wiki ICM — Inicio"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg font-semibold tracking-tight text-foreground sm:gap-3"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen aria-hidden="true" className="size-6" />
          </span>
          <span className="text-lg sm:text-xl">Wiki ICM</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1 md:gap-5">
          <nav aria-label="Navegación principal" className="hidden md:block">
            <ul className="flex items-center gap-1 lg:gap-4">
              {navigationLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
          <MobileNavigation links={navigationLinks} />
        </div>
      </div>
    </header>
  );
}
