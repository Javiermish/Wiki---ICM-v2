import { Info } from "lucide-react";

export function PrototypeNotice() {
  return (
    <aside aria-label="Aviso de prototipo" className="border-b border-border bg-muted">
      <div className="page-container flex gap-2.5 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p><strong className="font-semibold text-foreground">Prototipo con datos ficticios.</strong>{" "}
          La carga inicial contiene ramos ilustrativos, no la malla oficial de la UdeC. Catálogo y solicitudes se consultan en PostgreSQL; los archivos y su moderación siguen siendo demostrativos. Los favoritos siguen siendo locales, sin sincronización.</p>
      </div>
    </aside>
  );
}
