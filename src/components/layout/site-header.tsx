import { BookOpen } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getAccount } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { Suspense } from "react";
import type { Account } from "@/domain/auth";

const navigationLinks = [
  { href: "/#explorar", label: "Explorar" },
  { href: "/electivos", label: "Electivos" },
  { href: "/#materiales", label: "Materiales" },
  { href: "/#comunidad", label: "Comunidad" },
  { href: "/aportar", label: "Aportar" },
  { href: "/favoritos", label: "Favoritos · demo" },
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
        <div className="flex shrink-0 items-center gap-1 lg:gap-3">
          <nav aria-label="Navegación principal" className="hidden xl:block">
            <ul className="flex items-center gap-1">
              {navigationLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
          <Suspense fallback={<AccountControls account={null} />}><AccountContent /></Suspense>
        </div>
      </div>
    </header>
  );
}

async function AccountContent() {
  // Auth reads the clock internally; keep it after the request boundary, not in the static shell.
  await connection();
  const account = await getAccount();
  return <AccountControls account={account} />;
}

function AccountControls({ account }: { account: Account | null }) {
  const accountLinks = account
    ? [
      { href: "/mi-cuenta", label: "Mi cuenta" },
      { href: "/mis-aportes", label: "Mis aportes · próximamente" },
      ...(account.role === "moderator" || account.role === "admin" ? [{ href: "/moderacion", label: "Moderación · demo" }] : []),
      ...(account.role === "admin" ? [{ href: "/admin/usuarios", label: "Gestión de usuarios" }] : []),
    ]
    : [{ href: "/login", label: "Iniciar sesión" }, { href: "/registro", label: "Registrarse" }];
  return <>
    <nav aria-label="Cuenta" className="hidden xl:block">
      {account ? <details className="relative">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">Mi cuenta ▾</summary>
        <ul className="absolute right-0 top-full z-30 min-w-64 rounded-xl border border-border bg-background p-2 shadow-lg">
          {accountLinks.map((link) => <li key={link.href}><Link href={link.href} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted">{link.label}</Link></li>)}
          <li><LogoutButton /></li>
        </ul>
      </details> : <div className="flex">{accountLinks.map((link) => <Link key={link.href} href={link.href} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">{link.label}</Link>)}</div>}
    </nav>
    <MobileNavigation links={[...navigationLinks, ...accountLinks]} signedIn={Boolean(account)} />
  </>;
}
