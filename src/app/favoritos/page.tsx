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
      <Badge>Demostración pública · guardado en este navegador</Badge>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Tus favoritos de demostración</h1>
      <p className="mt-3 text-muted-foreground">Guarda asignaturas regulares, electivas y documentos aprobados de ejemplo. No es una cuenta real ni una selección guardada en un servidor.</p>
      <div className="mt-5 space-y-2 rounded-xl border border-border bg-secondary p-5 text-sm text-secondary-foreground">
        <p className="font-semibold">Sin inicio de sesión: favoritos locales, sin sincronización entre dispositivos.</p>
        <p>Solo se guardan identificadores en el almacenamiento de este navegador, no archivos ni datos sensibles. Pueden perderse si borras los datos del sitio o usas navegación privada. Si falla el almacenamiento, la selección queda solo en memoria y se avisa.</p>
        <p>El catálogo dinámico sigue siendo temporal: los favoritos de ramos creados en memoria se descartan al recargar si el ramo ya no existe. Otras pestañas leen la selección al abrir o recargar; no hay sincronización en vivo.</p>
        <p>Guardar en una cuenta requerirá correo electrónico verificado y Supabase en un hito posterior. Esta demo no crea una sesión.</p>
      </div>
      <noscript><p className="mt-4 text-sm text-muted-foreground">Activa JavaScript para usar los favoritos locales de demostración.</p></noscript>
    </header>
    <FavoritesContent />
  </main>;
}
