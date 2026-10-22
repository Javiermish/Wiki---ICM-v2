import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="page-container flex flex-col gap-6 py-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/" className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight">Wiki ICM</Link>
          <p className="text-sm text-muted-foreground">Una biblioteca construida en comunidad.</p>
        </div>
        <div className="max-w-md text-sm text-muted-foreground sm:text-right">
          <nav aria-label="Pie de página" className="mb-3 flex flex-wrap gap-x-6 sm:justify-end">
            <Link className="inline-flex min-h-11 items-center hover:text-primary" href="/#explorar">Explorar ejemplos</Link>
            <Link className="inline-flex min-h-11 items-center hover:text-primary" href="/electivos">Electivos</Link>
            <Link className="inline-flex min-h-11 items-center hover:text-primary" href="/gestion/asignaturas">Gestionar ramos · demo pública</Link>
            <Link className="inline-flex min-h-11 items-center hover:text-primary" href="/moderacion">Moderación · demo pública</Link>
            <Link className="inline-flex min-h-11 items-center hover:text-primary" href="/#comunidad">Sobre el proyecto</Link>
          </nav>
          <p>Prototipo · Hito 1.5. Archivos locales de demostración.</p>
          <p>No representa la malla oficial de la UdeC.</p>
        </div>
      </div>
    </footer>
  );
}
