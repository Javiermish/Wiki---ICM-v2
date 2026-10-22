"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { ContributionField } from "@/components/contributions/contribution-field";
import { CourseInputFields } from "@/components/courses/course-input-fields";
import { Button } from "@/components/ui/button";
import { contributionDisplayName, validateContributionDraft, type ContributionDraft, type ContributionFieldErrors } from "@/domain/contribution";
import { CourseValidationError, validateCourseInput, type CourseFieldErrors } from "@/domain/course-management";
import { metadataDraft, ModerationMetadataError, proposalInput, type ReviewCourseRequest, type ReviewMaterial } from "@/domain/moderation";
import { useModeration } from "./moderation-provider";

export function MaterialMetadataEditor({ material, onDone }: { material: ReviewMaterial; onDone: (message: string) => void }) {
  const { catalog } = useCourseCatalog();
  const { service } = useModeration();
  const [draft, setDraft] = useState(() => metadataDraft(material.metadata));
  const [errors, setErrors] = useState<ContributionFieldErrors>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { if (revision) summary.current?.focus(); }, [revision]);
  const validation = validateContributionDraft(draft, catalog.courses);
  function control(field: keyof ContributionDraft) {
    return { id: `contribution-${material.id}-${field}`, name: field, value: draft[field], className: "field", "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `contribution-${material.id}-${field}-error` : undefined, onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [field]: event.target.value })) };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setErrors({}); setError("");
    try {
      await service.correctMaterialMetadata(material.id, draft, reason);
      setReason("");
      onDone("Metadatos corregidos solo en la cola DEMO; el nombre normalizado se actualizó. No cambió el catálogo público.");
    } catch (error) {
      if (error instanceof ModerationMetadataError) setErrors(error.errors);
      setError(error instanceof Error ? error.message : "No se pudo corregir la muestra.");
      setRevision((value) => value + 1);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="mt-4 border-t border-border pt-3">
    <summary className="min-h-11 py-2 font-semibold text-primary">Corregir metadatos de la muestra</summary>
    <form noValidate onSubmit={submit} aria-busy={busy} className="mt-4 space-y-5">
      {error ? <div ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-4 text-sm"><p className="font-semibold text-destructive">{error}</p><ul>{Object.entries(errors).map(([field, message]) => <li key={field}><a className="text-link inline-flex min-h-11 items-center" href={`#contribution-${material.id}-${field}`}>{message}</a></li>)}</ul></div> : null}
      <fieldset disabled={busy} className="space-y-5"><legend className="sr-only">Corrección de metadatos sintéticos</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <ContributionField name={`${material.id}-courseId`} label="Ramo" error={errors.courseId}><select {...control("courseId")}><option value="">Selecciona un ramo activo</option>{catalog.courses.filter((course) => course.status === "active").map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></ContributionField>
          <ContributionField name={`${material.id}-category`} label="Categoría" error={errors.category}><select {...control("category")}><option value="listado">Listados</option><option value="apunte">Apuntes</option><option value="certamen">Certámenes</option></select></ContributionField>
          {([ ["documentNumber", "Número del documento"], ["academicYear", "Año académico"], ["academicTerm", "Semestre académico (1 o 2, no malla)"], ["title", "Título secundario"], ["section", "Sección"], ["instructor", "Profesor/a"], ["version", "Versión"] ] as const).map(([field, label]) => <ContributionField key={field} name={`${material.id}-${field}`} label={label} optional={["title", "section", "instructor", "version"].includes(field) || (field === "documentNumber" && draft.category === "apunte")} error={errors[field]}><input {...control(field)} inputMode={["documentNumber", "academicYear", "academicTerm"].includes(field) ? "numeric" : "text"} /></ContributionField>)}
        </div>
        <p className="rounded-lg bg-muted p-3 text-sm">Nombre normalizado: <strong>{validation.ok ? contributionDisplayName(validation.value) : "Completa metadatos válidos"}</strong></p>
        <div><label htmlFor={`${material.id}-correction-reason`} className="mb-2 block text-sm font-semibold">Motivo de corrección (obligatorio)</label><textarea id={`${material.id}-correction-reason`} className="field" rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <Button type="submit" className="min-h-11">{busy ? "Corrigiendo…" : "Guardar corrección DEMO"}</Button>
      </fieldset>
    </form>
  </details>;
}

export function RequestMetadataEditor({ request, onDone }: { request: ReviewCourseRequest; onDone: (message: string) => void }) {
  const { catalog } = useCourseCatalog();
  const { service } = useModeration();
  const [input, setInput] = useState(() => proposalInput(request.proposedCourse));
  const [errors, setErrors] = useState<CourseFieldErrors>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { if (revision) summary.current?.focus(); }, [revision]);
  const duplicates = validateCourseInput(input, catalog).duplicates;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setErrors({}); setError("");
    try {
      await service.correctCourseRequest(request.id, input, reason);
      setReason("");
      onDone("Propuesta corregida solo en la DEMO. No se creó ni modificó ningún ramo del catálogo.");
    } catch (error) {
      if (error instanceof CourseValidationError) setErrors(error.errors);
      setError(error instanceof Error ? error.message : "No se pudo corregir la solicitud.");
      setRevision((value) => value + 1);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="mt-4 border-t border-border pt-3">
    <summary className="min-h-11 py-2 font-semibold text-primary">Corregir propuesta del ramo</summary>
    <form noValidate onSubmit={submit} aria-busy={busy} className="mt-4 space-y-5">
      {error ? <div ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-4 text-sm"><p className="font-semibold text-destructive">{error}</p><ul>{Object.entries(errors).map(([field, message]) => <li key={field}><a className="text-link inline-flex min-h-11 items-center" href={`#${request.id}-${field}`}>{message}</a></li>)}</ul></div> : null}
      <fieldset disabled={busy} className="space-y-5"><legend className="sr-only">Propuesta de ramo sintético</legend>
        <CourseInputFields input={input} errors={errors} areas={catalog.electiveAreas} prefix={request.id} onChange={(field, value) => setInput((current) => ({ ...current, [field]: value }))} />
        {duplicates.length ? <p className="rounded-lg bg-muted p-3 text-sm">Posibles duplicados del catálogo (incluidos archivados): {duplicates.map((course) => course.name).join(", ")}. Exactos bloquean; aproximados solo advierten.</p> : null}
        <div><label htmlFor={`${request.id}-correction-reason`} className="mb-2 block text-sm font-semibold">Motivo de corrección (obligatorio)</label><textarea id={`${request.id}-correction-reason`} className="field" rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <Button type="submit" className="min-h-11">{busy ? "Corrigiendo…" : "Guardar propuesta DEMO"}</Button>
      </fieldset>
    </form>
  </details>;
}
