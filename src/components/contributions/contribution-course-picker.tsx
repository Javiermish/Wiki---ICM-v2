"use client";

import { useState } from "react";
import type { Course } from "@/domain/catalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { normalizeSearch } from "@/lib/catalog/query";

export function ContributionCoursePicker({ courses, value, error, onChange }: {
  courses: readonly Course[];
  value: string;
  error?: string;
  onChange: (courseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = courses.find((course) => course.id === value);
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const filtered = courses.filter((course) => words.every((word) => normalizeSearch(`${course.name} ${course.code ?? ""}`).includes(word)));

  return <div className="space-y-4">
    <div>
      <label htmlFor="contribution-course-search" className="mb-2 block text-sm font-medium">Buscar ramo por nombre o código</label>
      <input id="contribution-course-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field" placeholder="Por ejemplo: Cálculo" aria-describedby="contribution-course-hint" />
      <p id="contribution-course-hint" className="mt-2 text-sm text-muted-foreground">Ramos ficticios de demostración; no representan la malla oficial.</p>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "ramo encontrado" : "ramos encontrados"}.</p>
    <fieldset id="contribution-courseId" tabIndex={-1} aria-invalid={Boolean(error)} aria-describedby={error ? "contribution-courseId-error" : undefined}>
      <legend className="mb-2 text-sm font-semibold">Selecciona un ramo (obligatorio)</legend>
      {filtered.length ? <div className="grid gap-2 sm:grid-cols-2">{filtered.map((course) => <label key={course.id} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-3 ${value === course.id ? "border-primary bg-secondary" : "border-border bg-background"}`}>
        <input form="contribution-form" type="radio" name="courseId" value={course.id} checked={value === course.id} onChange={() => onChange(course.id)} className="mt-1 size-5 shrink-0 accent-primary" />
        <span className="min-w-0"><span className="block text-sm font-medium">{course.name}</span><span className="block text-xs text-muted-foreground">{course.code ? `${course.code} · ` : ""}Semestre curricular {course.curricularSemester}</span></span>
      </label>)}</div> : <div className="rounded-lg bg-muted p-4"><p className="text-sm">No encontramos ramos con esa búsqueda.</p><Button type="button" variant="link" className="mt-2 min-h-11 px-0" onClick={() => setQuery("")}>Limpiar búsqueda</Button></div>}
    </fieldset>
    {error ? <p id="contribution-courseId-error" className="text-sm font-medium text-destructive">{error}</p> : null}
    {selected ? <div className="rounded-lg border border-border bg-muted p-4" role="status"><Badge>Ramo seleccionado</Badge><p className="mt-2 font-semibold">{selected.name}</p><p className="text-sm text-muted-foreground">Semestre curricular {selected.curricularSemester}. Esta ubicación no determina el período del documento.</p></div> : null}
  </div>;
}
