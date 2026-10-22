"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { courseFacets, publicMaterialById } from "@/lib/catalog/query";
import { useCourseCatalog } from "./course-catalog-provider";
import { useFavorites } from "./favorites-provider";
import { MaterialCard } from "./material-card";
import { CourseCard } from "./course-card";
import { sameFavorite, type FavoriteReference } from "@/domain/favorites";

export function FavoritesContent() {
  const { catalog } = useCourseCatalog();
  const { references, ready } = useFavorites();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedReference = useRef<FavoriteReference | null>(null);
  // Resolver por ID en cada catálogo conserva renombres, áreas y ramos archivados,
  // sin almacenar snapshots ni exponer materiales pendientes o rechazados.
  const materials = references.flatMap((reference) => {
    const material = reference.kind === "material" && publicMaterialById(catalog, reference.id);
    return material ? [material] : [];
  });
  const courses = references.flatMap((reference) => {
    const course = reference.kind === "course" && catalog.courses.find(course => course.id === reference.id);
    return course ? [course] : [];
  });

  useEffect(() => {
    const focused = focusedReference.current;
    if (focused && !references.some(reference => sameFavorite(reference, focused))) {
      // Al quitar la tarjeta enfocada, no dejar el foco perdido en el documento.
      if (document.activeElement === document.body) heading.current?.focus();
      focusedReference.current = null;
    }
  }, [references]);

  return <section aria-labelledby="favorites-list-heading" className="space-y-5">
    <h2 id="favorites-list-heading" ref={heading} tabIndex={-1} className="text-2xl font-semibold">Tu selección local</h2>
    {!ready ? <p role="status">Cargando favoritos del navegador…</p> : null}
    <section aria-labelledby="favorite-courses-heading" className="space-y-4">
      <h3 id="favorite-courses-heading" className="text-xl font-semibold">Asignaturas</h3>
      <p role="status" className="text-sm text-muted-foreground">{courses.length} {courses.length === 1 ? "asignatura guardada" : "asignaturas guardadas"}: regulares y electivas.</p>
      {courses.length ? <ul className="grid gap-4 sm:grid-cols-2">{courses.map(course => <li key={course.id} onFocusCapture={() => { focusedReference.current = { kind: "course", id: course.id }; }}>
        <CourseCard course={course} counts={{ listado: courseFacets(catalog, course.id, "listado").count, apunte: courseFacets(catalog, course.id, "apunte").count, certamen: courseFacets(catalog, course.id, "certamen").count }} />
      </li>)}</ul> : <EmptyState title="Todavía no has guardado asignaturas"><p>Guarda un ramo regular o electivo desde su tarjeta o ficha.</p><Link href="/#explorar" className="text-link mt-3 inline-flex min-h-11 items-center">Explorar asignaturas</Link><Link href="/electivos" className="text-link ml-5 inline-flex min-h-11 items-center">Ver electivos</Link></EmptyState>}
    </section>
    <section aria-labelledby="favorite-materials-heading" className="space-y-4">
    <h3 id="favorite-materials-heading" className="text-xl font-semibold">Documentos aprobados</h3>
    <p role="status" className="text-sm text-muted-foreground">{materials.length} {materials.length === 1 ? "material aprobado en tus favoritos de demo" : "materiales aprobados en tus favoritos de demo"}.</p>
    {materials.length ? <>
      <p className="text-sm text-muted-foreground">La selección sigue el ID del material: cambiar el nombre, área o estado de su ramo en la demo no lo quita de aquí.</p>
      <ul className="space-y-4">{materials.map((material) => <li key={material.id} onFocusCapture={() => { focusedReference.current = { kind: "material", id: material.id }; }}>
        <MaterialCard material={material} />
      </li>)}</ul>
    </> : <EmptyState title="Aún no tienes favoritos en esta demo">
      <p>Busca un material aprobado y pulsa «Guardar · demo». Volverás a encontrarlo aquí al regresar desde este navegador.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Link href="/#explorar" className="text-link inline-flex min-h-11 items-center">Explorar por semestre</Link>
        <Link href="/electivos" className="text-link inline-flex min-h-11 items-center">Explorar electivos</Link>
      </div>
    </EmptyState>}
    </section>
  </section>;
}
