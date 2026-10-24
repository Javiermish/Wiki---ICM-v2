import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PrototypeNotice } from "@/components/layout/prototype-notice";
import { themeInitializationScript } from "@/lib/theme";
import { Suspense } from "react";
import { PersistentCatalogShell } from "@/components/catalog/persistent-catalog-shell";
import { CatalogLoading } from "@/components/catalog/catalog-loading";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wiki ICM — Biblioteca colaborativa (prototipo)",
  description: "Prototipo de biblioteca colaborativa de Ingeniería Civil Matemática. Explora apuntes, listados y certámenes ficticios; no representa la malla oficial de la UdeC.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#contenido" className="fixed top-3 left-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground focus:translate-y-0">Saltar al contenido</a>
        <SiteHeader />
        <PrototypeNotice />
        <Suspense fallback={<CatalogLoading />}>
          <PersistentCatalogShell>{children}</PersistentCatalogShell>
        </Suspense>
          <SiteFooter />
      </body>
    </html>
  );
}
