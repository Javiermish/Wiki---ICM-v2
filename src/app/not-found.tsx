import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Página no encontrada" }]} />
      <h1 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl">No encontramos esta página</h1>
      <EmptyState title="Este enlace no está en el catálogo de ejemplo">
        <p>Revisa la dirección o vuelve al inicio para explorar los semestres y ramos ficticios disponibles.</p>
        <Link href="/#explorar" className="text-link mt-3 inline-flex min-h-11 items-center rounded font-semibold">Volver a explorar</Link>
      </EmptyState>
    </main>
  );
}
