import type { Metadata } from "next";
import { FavoritesContent } from "@/components/catalog/favorites-content";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Favoritos · Demo local · Wiki ICM",
  robots: { index: false, follow: false },
};

export default function FavoritesPage() {
  return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Favoritos · demo" }]} />
    <header className="mb-8 max-w-3xl">
      <Badge>Demostración pública · solo memoria</Badge>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Tus favoritos de demostración</h1>
      <p className="mt-3 text-muted-foreground">Prueba una lista temporal de materiales de ejemplo. No es una cuenta real ni una selección guardada en un servidor.</p>
      <div className="mt-5 space-y-2 rounded-xl border border-border bg-secondary p-5 text-sm text-secondary-foreground">
        <p className="font-semibold">Sin inicio de sesión: esta lista solo vive en memoria.</p>
        <p>Se mantiene durante la navegación interna en esta pestaña. Al recargarla o cerrarla se pierde; no se sincroniza con otras pestañas, dispositivos ni usuarios.</p>
        <p>Los favoritos reales requerirán iniciar sesión con un correo electrónico verificado. Esa función está próximamente: esta demo no crea una cuenta ni guarda datos de forma persistente.</p>
      </div>
      <noscript><p className="mt-4 text-sm text-muted-foreground">Activa JavaScript para usar los favoritos temporales de demostración.</p></noscript>
    </header>
    <FavoritesContent />
  </main>;
}
