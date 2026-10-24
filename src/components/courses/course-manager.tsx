"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { buttonVariants as buttonStyles } from "@/components/ui/button";
import type { Catalog, Course } from "@/domain/catalog";
import { validateCourseInput, type CourseInput } from "@/domain/course-management";
import { categoryLabels, courseMaterials, normalizeSearch } from "@/lib/catalog/query";
import { CourseInputFields } from "./course-input-fields";

type FieldErrors = Partial<Record<keyof CourseInput, string>>;
const emptyInput: CourseInput = {
  name: "", code: "", kind: "regular", curricularSemester: "", electiveAreaId: "", description: "",
};
const categories = ["listado", "apunte", "certamen"] as const;

function courseInput(course: Course): CourseInput {
  return {
    name: course.name,
    code: course.code ?? "",
    kind: course.kind,
    curricularSemester: course.curricularSemester === null ? "" : String(course.curricularSemester),
    electiveAreaId: course.electiveAreaId ?? "",
    description: course.description ?? "",
  };
}

function courseLocation(course: Course, catalog: Catalog): string {
  return course.kind === "regular"
    ? `Semestre curricular ${course.curricularSemester}`
    : `Electivo · ${catalog.electiveAreas.find((area) => area.id === course.electiveAreaId)?.name ?? "Área no disponible"}`;
}

function CourseDetails({ course, catalog }: { course: Course; catalog: Catalog }) {
  const materials = courseMaterials(catalog, course.id);
  return <details className="mt-4 border-t border-border pt-3">
    <summary className="min-h-11 py-2 text-sm font-semibold text-primary">Consultar detalles de {course.name}</summary>
    <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 [overflow-wrap:anywhere]">
      <div><dt className="font-semibold">ID estable</dt><dd className="font-mono">{course.id}</dd></div>
      <div><dt className="font-semibold">Código</dt><dd>{course.code || "Sin código"}</dd></div>
      <div><dt className="font-semibold">Tipo y ubicación</dt><dd>{course.kind === "regular" ? "Regular · " : ""}{courseLocation(course, catalog)}</dd></div>
      <div><dt className="font-semibold">Estado</dt><dd>{course.status === "archived" ? "Archivado" : "Activo"}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Descripción</dt><dd className="whitespace-pre-wrap">{course.description || "Sin descripción."}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Ruta estable (no editable)</dt><dd>/ramos/{course.slug}</dd></div>
    </dl>
    <h4 className="mt-5 text-sm font-semibold">Materiales aprobados: {materials.length}</h4>
    <ul className="mt-2 flex flex-wrap gap-2 text-sm">{categories.map((category) => <li key={category} className="rounded-lg bg-muted px-3 py-2">{categoryLabels[category]}: {materials.filter((material) => material.category === category).length}</li>)}</ul>
    <p className="mt-3 text-sm text-muted-foreground">Las tres categorías existen aunque estén vacías. No se cuentan ni muestran materiales pendientes o rechazados.</p>
    <Link href={`/ramos/${course.slug}`} className="text-link mt-2 inline-flex min-h-11 items-center">Abrir ramo: {course.name}</Link>
  </details>;
}

export function CourseManager() {
  const { catalog, createCourse, updateCourse, setCourseArchived } = useCourseCatalog();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | undefined>();
  const [input, setInput] = useState<CourseInput>(emptyInput);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [rejectedDuplicates, setRejectedDuplicates] = useState<Course[]>([]);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [archiveErrorRevision, setArchiveErrorRevision] = useState(0);
  const [interactive, setInteractive] = useState(false);
  const [busy, setBusy] = useState<"save" | "archive" | null>(null);
  const operationInFlight = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const archiveConfirmation = useRef<HTMLDivElement>(null);
  const archiveErrorControl = useRef<HTMLParagraphElement>(null);
  const nameControl = useRef<HTMLInputElement>(null);
  const noticeControl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setInteractive(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (summaryRevision) summary.current?.focus(); }, [summaryRevision]);
  useEffect(() => { if (confirmationId) archiveConfirmation.current?.focus(); }, [confirmationId]);
  useEffect(() => { if (notice) noticeControl.current?.focus(); }, [notice]);
  useEffect(() => { if (archiveErrorRevision) archiveErrorControl.current?.focus(); }, [archiveErrorRevision]);

  const controlsDisabled = !interactive || busy !== null;

  const editingCourse = catalog.courses.find((course) => course.id === editingId);
  const validation = validateCourseInput(input, catalog, editingId ?? undefined);
  const duplicates = [...new Map([...validation.duplicates, ...rejectedDuplicates].map((course) => [course.id, course])).values()];
  const errorEntries = Object.entries(errors).filter((entry): entry is [keyof CourseInput, string] => Boolean(entry[1]));
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const filteredCourses = catalog.courses.filter((course) => {
    if (statusFilter !== "all" && course.status !== statusFilter) return false;
    const text = normalizeSearch(`${course.name} ${course.code ?? ""} ${course.id} ${courseLocation(course, catalog)}`);
    return words.every((word) => text.includes(word));
  });

  function openForm(course?: Course) {
    if (!interactive || operationInFlight.current) return;
    setEditingId(course?.id ?? null);
    setEditingVersion(course?.version);
    setInput(course ? courseInput(course) : { ...emptyInput });
    setErrors({});
    setFormError("");
    setRejectedDuplicates([]);
    setNotice("");
    setConfirmationId(null);
    nameControl.current?.focus();
  }

  function updateField<K extends keyof CourseInput>(name: K, value: CourseInput[K]) {
    if (!interactive || operationInFlight.current) return;
    setInput((current) => ({ ...current, [name]: value }));
    setErrors((current) => name === "kind"
      ? { ...current, kind: undefined, curricularSemester: undefined, electiveAreaId: undefined }
      : { ...current, [name]: undefined });
    setFormError("");
    setRejectedDuplicates([]);
    setNotice("");
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive || operationInFlight.current) return;
    setNotice("");
    setFormError("");
    const result = validateCourseInput(input, catalog, editingId ?? undefined);
    setErrors(result.errors);
    setRejectedDuplicates(result.duplicates);
    if (Object.values(result.errors).some(Boolean)) {
      setSummaryRevision((current) => current + 1);
      return;
    }
    operationInFlight.current = true;
    setBusy("save");
    try {
      const course = editingId ? await updateCourse(editingId, input, editingVersion) : await createCourse(input);
      setNotice(`${editingId ? "Cambios guardados" : "Ramo creado"}: ${course.name}.`);
      setEditingId(null);
      setInput({ ...emptyInput });
      setRejectedDuplicates([]);
    } catch {
      setFormError("No se pudo guardar. Tus datos se conservan. Comprueba duplicados y permisos; si otro administrador cambió el ramo, recarga antes de reintentar.");
      setSummaryRevision((current) => current + 1);
    } finally {
      operationInFlight.current = false;
      setBusy(null);
    }
  }

  async function changeArchive(course: Course, archived: boolean) {
    if (!interactive || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy("archive");
    setNotice("");
    setArchiveError("");
    try {
      await setCourseArchived(course.id, archived);
      setConfirmationId(null);
      setNotice(`${course.name}: ${archived ? "archivado" : "reabierto"}. Sus documentos e identificadores se conservan.`);
    } catch {
      setArchiveError("No se pudo cambiar el estado del ramo. No se eliminó ningún documento. Recarga para comprobar su estado y tus permisos antes de reintentar.");
      setArchiveErrorRevision((current) => current + 1);
    } finally {
      operationInFlight.current = false;
      setBusy(null);
    }
  }

  return <div>
    <p role="status" className={busy ? "mb-5 rounded-lg bg-muted p-4 text-sm" : "sr-only"}>{busy === "save" ? "Guardando cambios…" : busy === "archive" ? "Cambiando el estado del ramo…" : ""}</p>
    <noscript><p className="mb-5 rounded-xl border border-border bg-secondary p-5 text-sm text-secondary-foreground">Activa JavaScript para gestionar los ramos. El formulario está deshabilitado y no se enviará sin JavaScript.</p></noscript>
    <fieldset disabled={controlsDisabled} aria-busy={busy !== null} className="min-w-0 space-y-8">
    <legend className="sr-only">Administración del catálogo de asignaturas</legend>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">{catalog.courses.length} ramos, incluidos los archivados.</p>
      <a href="#course-form" aria-disabled={controlsDisabled} tabIndex={controlsDisabled ? -1 : undefined} className={buttonStyles({ className: "min-h-11 px-4 aria-disabled:opacity-50" })} onClick={(event) => { event.preventDefault(); openForm(); }}>Crear asignatura</a>
    </div>
    <div ref={noticeControl} role="status" tabIndex={-1} className={notice ? "rounded-xl border border-primary bg-secondary p-5 text-sm text-secondary-foreground" : "sr-only"}>{notice}</div>

    <section aria-labelledby="course-list-heading" className="space-y-5">
      <h2 id="course-list-heading" className="text-2xl font-semibold">Consultar asignaturas</h2>
      <div role="search" aria-label="Buscar asignaturas" className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[1fr_auto]">
        <div><label htmlFor="course-search" className="mb-2 block text-sm font-semibold">Buscar por nombre, código, ID o ubicación</label><input id="course-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field form-control" placeholder="Por ejemplo: Cálculo" /></div>
        <div><label htmlFor="course-status" className="mb-2 block text-sm font-semibold">Estado</label><select id="course-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field form-control"><option value="all">Activos y archivados</option><option value="active">Solo activos</option><option value="archived">Solo archivados</option></select></div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{filteredCourses.length} {filteredCourses.length === 1 ? "asignatura encontrada" : "asignaturas encontradas"}.</p>
      {archiveError ? <p ref={archiveErrorControl} tabIndex={-1} role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">{archiveError}</p> : null}
      {filteredCourses.length ? <ul className="space-y-4">{filteredCourses.map((course) => <li key={course.id}>
        <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0 sm:flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{course.status === "archived" ? "Archivado" : "Activo"} · {course.code || "Sin código"}</p><h3 className="mt-1 text-xl font-semibold">{course.name}</h3><p className="mt-2 text-sm text-muted-foreground">{courseLocation(course, catalog)}</p></div>
            <div className="flex shrink-0 flex-wrap gap-2"><button type="button" className={buttonStyles({ variant: "outline", className: "min-h-11 px-4" })} onClick={() => openForm(course)} aria-label={`Editar ${course.name}`}>Editar</button>
              {course.status === "archived" ? <button type="button" className={buttonStyles({ variant: "outline", className: "min-h-11 px-4" })} onClick={() => changeArchive(course, false)} aria-label={`Reabrir ${course.name}`}>Reabrir</button> : <button id={`archive-trigger-${course.id}`} type="button" className={buttonStyles({ variant: "outline", className: "min-h-11 px-4" })} onClick={() => { setNotice(""); setArchiveError(""); setConfirmationId(course.id); }} aria-label={`Archivar ${course.name}`} aria-expanded={confirmationId === course.id} aria-controls={confirmationId === course.id ? `archive-${course.id}` : undefined}>Archivar</button>}
            </div>
          </div>
          {confirmationId === course.id ? <div id={`archive-${course.id}`} ref={archiveConfirmation} tabIndex={-1} role="group" aria-labelledby={`archive-heading-${course.id}`} aria-describedby={`archive-description-${course.id}`} className="mt-4 rounded-lg border border-border bg-muted p-4">
            <h4 id={`archive-heading-${course.id}`} className="font-semibold">¿Archivar {course.name}?</h4>
            <p id={`archive-description-${course.id}`} className="mt-2 text-sm">El ramo dejará de aparecer entre los activos. No se elimina: conserva su ID, ruta y todos sus documentos. Podrás consultarlo aquí y reabrirlo.</p>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonStyles({ className: "min-h-11 px-4" })} onClick={() => changeArchive(course, true)}>Confirmar archivo</button><button type="button" className={buttonStyles({ variant: "outline", className: "min-h-11 px-4" })} onClick={() => { setConfirmationId(null); document.getElementById(`archive-trigger-${course.id}`)?.focus(); }}>Cancelar</button></div>
          </div> : null}
          <CourseDetails course={course} catalog={catalog} />
        </article>
      </li>)}</ul> : <div className="rounded-xl border border-border bg-card p-6"><h3 className="font-semibold">No hay asignaturas con estos filtros</h3><p className="mt-2 text-sm text-muted-foreground">Prueba otro nombre o incluye los ramos archivados.</p><button type="button" className={buttonStyles({ variant: "outline", className: "mt-4 min-h-11 px-4" })} onClick={() => { setQuery(""); setStatusFilter("all"); }}>Limpiar búsqueda y estado</button></div>}
    </section>

    <section id="course-form" aria-labelledby="course-form-heading" className="rounded-xl border border-border bg-card p-5 sm:p-8">
      <h2 id="course-form-heading" className="text-2xl font-semibold">{editingCourse ? `Editar: ${editingCourse.name}` : "Crear asignatura"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Los cambios se guardan en el catálogo compartido. Comprueba nombre, código y ubicación antes de confirmar; el catálogo no acredita una malla oficial.</p>
      {editingCourse ? <p className="mt-3 text-sm [overflow-wrap:anywhere]">ID: <span className="font-mono">{editingCourse.id}</span> · Ruta: /ramos/{editingCourse.slug}. Ambos se conservan y no son editables.</p> : null}
      <form noValidate onSubmit={saveCourse} aria-busy={busy === "save"} aria-labelledby="course-form-heading" className="mt-6 space-y-6">
        {errorEntries.length || formError ? <div ref={summary} tabIndex={-1} role="alert" aria-labelledby="course-errors-heading" className="rounded-xl border border-destructive p-5">
          <h3 id="course-errors-heading" className="font-semibold text-destructive">Revisa los datos de la asignatura</h3>
          {formError ? <p className="mt-2 text-sm">{formError}</p> : null}
          <ul className="mt-2 list-inside list-disc text-sm">{errorEntries.map(([field, message]) => <li key={field}><a href={`#course-${field}`} className="text-link inline-block min-h-11 py-2" onClick={(event) => { event.preventDefault(); document.getElementById(`course-${field}`)?.focus(); }}>{message}</a></li>)}</ul>
        </div> : null}
        <CourseInputFields input={input} errors={errors} areas={catalog.electiveAreas} onChange={updateField} nameRef={nameControl} />
        {duplicates.length ? <aside aria-labelledby="course-duplicates-heading" className="rounded-xl border border-border bg-muted p-5">
          <h3 id="course-duplicates-heading" className="font-semibold">Posibles duplicados: comprueba el catálogo</h3>
          <p className="mt-2 text-sm">Estas coincidencias incluyen ramos archivados. Las coincidencias exactas que detecte la validación impiden guardar; las demás son una advertencia local, no una revisión humana.</p>
          <ul className="mt-3 space-y-2 text-sm">{duplicates.map((course) => <li key={course.id}><Link className="text-link inline-flex min-h-11 items-center" href={`/ramos/${course.slug}`}>{course.name}{course.code ? ` · ${course.code}` : ""} · {course.status === "archived" ? "Archivado" : "Activo"}</Link><span className="block text-muted-foreground">{courseLocation(course, catalog)} · ID: {course.id}</span></li>)}</ul>
        </aside> : null}
        <div className="flex flex-wrap gap-3"><button type="submit" disabled={controlsDisabled} className={buttonStyles({ className: "min-h-11 px-5" })}>{busy === "save" ? "Guardando cambios…" : editingCourse ? "Guardar cambios" : "Crear asignatura"}</button>{editingId ? <button type="button" className={buttonStyles({ variant: "outline", className: "min-h-11 px-4" })} onClick={() => openForm()}>Cancelar edición</button> : null}</div>
        <p className="text-sm text-muted-foreground">Guardar no modifica los períodos académicos de los documentos existentes.</p>
      </form>
    </section>
    </fieldset>
  </div>;
}
