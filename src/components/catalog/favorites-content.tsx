"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { publicMaterialById } from "@/lib/catalog/query";
import { useCourseCatalog } from "./course-catalog-provider";
import { useFavorites } from "./favorites-provider";
import { MaterialCard } from "./material-card";

export function FavoritesContent() {
  const { catalog } = useCourseCatalog();
  const { ids } = useFavorites();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedMaterialId = useRef<string | null>(null);
  // Resolver por ID en cada catálogo conserva renombres, áreas y ramos archivados,
  // sin almacenar snapshots ni exponer materiales pendientes o rechazados.
  const materials = ids.flatMap((id) => {
    const material = publicMaterialById(catalog, id);
    return material ? [material] : [];
  });

  useEffect(() => {
    const focusedId = focusedMaterialId.current;
    if (focusedId && (!ids.includes(focusedId) || !publicMaterialById(catalog, focusedId))) {
      // Al quitar la tarjeta enfocada, no dejar el foco perdido en el documento.
      if (document.activeElement === document.body) heading.current?.focus();
      focusedMaterialId.current = null;
    }
  }, [ids, catalog]);

  return <section aria-labelledby="favorites-list-heading" className="space-y-5">
    <h2 id="favorites-list-heading" ref={heading} tabIndex={-1} className="text-2xl font-semibold">Materiales en esta pestaña</h2>
    <p role="status" className="text-sm text-muted-foreground">{materials.length} {materials.length === 1 ? "material aprobado en tus favoritos de demo" : "materiales aprobados en tus favoritos de demo"}.</p>
    {materials.length ? <>
      <p className="text-sm text-muted-foreground">La selección sigue el ID del material: cambiar el nombre, área o estado de su ramo en la demo no lo quita de aquí.</p>
      <ul className="space-y-4">{materials.map((material) => <li key={material.id} onFocusCapture={() => { focusedMaterialId.current = material.id; }}>
        <MaterialCard material={material} />
      </li>)}</ul>
    </> : <EmptyState title="Aún no tienes favoritos en esta demo">
      <p>Busca un material y pulsa «Guardar · demo». Volverás a encontrarlo aquí mientras navegues en esta pestaña, sin recargarla.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Link href="/#explorar" className="text-link inline-flex min-h-11 items-center">Explorar por semestre</Link>
        <Link href="/electivos" className="text-link inline-flex min-h-11 items-center">Explorar electivos</Link>
      </div>
    </EmptyState>}
  </section>;
}
