import { Info } from "lucide-react";

export function PrototypeNotice() {
  return (
    <aside aria-label="Aviso de prototipo" className="border-b border-border bg-muted">
      <div className="page-container flex gap-2.5 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p><strong className="font-semibold text-foreground">Prototipo con datos ficticios.</strong>{" "}
          La carga inicial contiene ramos ilustrativos, no la malla oficial de la UdeC. Los aportes reales requieren almacenamiento configurado y revisión humana. Las muestras se identifican como DEMO. Favoritos locales, sin sincronización; reportes simulados.</p>
      </div>
    </aside>
  );
}
