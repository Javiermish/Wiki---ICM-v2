"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { courseClassification, searchCourses } from "@/lib/catalog/query";
import { checkContributionFile, contributionDisplayName, contributionDownloadName, createContributionDraft, validateContributionDraft, type ContributionDraft } from "@/domain/contribution";
import { fileFormats, hasExpectedSignature } from "@/lib/materials/file-metadata";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContributionSection } from "./contribution-section";
import { ContributionCoursePicker } from "./contribution-course-picker";
import { ContributionField } from "./contribution-field";
import { ContributionFilePicker } from "./contribution-file-picker";
import { LocalFilePreview, type PreviewStatus } from "./local-file-preview";

type FormErrors = Partial<Record<keyof ContributionDraft | "file" | "authorization", string>>;
type SelectedFile = { file: File; kind: "pdf" | "image"; revision: number };
const SUCCESS_MESSAGE = "Simulación completada. Ningún archivo fue enviado. El sistema de aportes estará disponible cuando se active la autenticación y el almacenamiento.";

export function ContributionForm({ courseSlug, invalidCourseLink = false }: {
  courseSlug?: string;
  invalidCourseLink?: boolean;
}) {
  const { catalog } = useCourseCatalog();
  const courses = searchCourses(catalog);
  const initialCourseId = courses.find((course) => course.slug === courseSlug)?.id ?? "";
  const invalidSelectionLink = invalidCourseLink || (courseSlug !== undefined && !initialCourseId);
  const [draft, setDraft] = useState<ContributionDraft>(() => ({ ...createContributionDraft(), courseId: initialCourseId }));
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [checkingFile, setCheckingFile] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [knownFileError, setKnownFileError] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const success = useRef<HTMLDivElement>(null);
  const selectionRevision = useRef(0);
  const activeFileRevision = useRef<number | null>(null);
  const previewRevision = selectedFile?.revision;
  const onPreviewStatusChange = useCallback((status: PreviewStatus) => {
    if (previewRevision !== activeFileRevision.current) return;
    setPreviewStatus(status);
    if (status === "error") { setKnownFileError(true); setCompleted(false); }
    if (status === "ready") setErrors((current) => ({ ...current, file: undefined }));
  }, [previewRevision, setCompleted, setErrors]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setCheckingFile(false); setInteractive(true); } });
    return () => { active = false; selectionRevision.current += 1; };
  }, []);
  useEffect(() => { if (summaryVersion) errorSummary.current?.focus(); }, [summaryVersion]);
  useEffect(() => { if (completed) success.current?.focus(); }, [completed]);

  const validation = validateContributionDraft(draft, courses);
  const displayName = validation.ok ? selectedFile
    ? contributionDownloadName(validation.value, selectedFile.file.type)
    : contributionDisplayName(validation.value) : null;
  const selectedCourse = courses.find((course) => course.id === draft.courseId);
  const visibleFileError = fileError ?? errors.file ?? (knownFileError && selectedFile ? "Se detectó un error de lectura en este archivo. Reemplázalo o vuelve a seleccionarlo para comprobarlo otra vez." : undefined);

  function updateField(name: keyof ContributionDraft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setCompleted(false);
  }

  async function selectFiles(files: readonly File[]) {
    if (!files.length) return;
    const revision = ++selectionRevision.current;
    setCompleted(false);
    setCheckingFile(false);
    setErrors((current) => ({ ...current, file: undefined }));
    if (files.length !== 1) { setFileError("Selecciona solo un archivo. Si ya elegiste uno válido, se conserva."); return; }
    const file = files[0];
    const result = checkContributionFile(file);
    if (!result.ok) { setFileError(result.errors.file); return; }
    setCheckingFile(true);
    setFileError(undefined);
    try {
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (revision !== selectionRevision.current) return;
      if (!hasExpectedSignature(bytes, result.value.extension)) {
        setFileError("El contenido no coincide con el formato declarado. Elige otro archivo; la selección válida anterior se conserva.");
        return;
      }
      activeFileRevision.current = revision;
      setKnownFileError(false);
      setSelectedFile({ file, kind: fileFormats[result.value.extension].kind, revision });
      setPreviewStatus("loading");
      setPreviewOpen(true);
    } catch {
      if (revision === selectionRevision.current) setFileError("No pudimos leer este archivo local. Inténtalo otra vez o elige otro archivo.");
    } finally {
      if (revision === selectionRevision.current) setCheckingFile(false);
    }
  }

  function removeFile() {
    selectionRevision.current += 1;
    activeFileRevision.current = null;
    setSelectedFile(null);
    setPreviewOpen(false);
    setPreviewStatus("loading");
    setKnownFileError(false);
    setFileError(undefined);
    setCheckingFile(false);
    setErrors((current) => ({ ...current, file: undefined }));
    setCompleted(false);
  }

  function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateContributionDraft(draft, courses);
    const nextErrors: FormErrors = { ...result.errors };
    const checkedFile = checkContributionFile(selectedFile?.file ?? null);
    if (!checkedFile.ok) nextErrors.file = checkedFile.errors.file;
    if (fileError) nextErrors.file = fileError;
    if (knownFileError) nextErrors.file = "Se detectó un error de lectura. Reemplaza o vuelve a seleccionar el archivo antes de simular.";
    if (checkingFile) nextErrors.file = "Espera a que termine la comprobación local del archivo.";
    else if (selectedFile && previewStatus !== "ready") nextErrors.file = previewStatus === "error" ? "No se pudo leer el archivo. Reemplázalo por uno que se pueda previsualizar." : "Abre la previsualización y espera a que el archivo termine de cargar antes de simular.";
    if (!authorized) nextErrors.authorization = "Confirma que tienes permiso para compartir este material.";
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setCompleted(false);
      setSummaryVersion((current) => current + 1);
      return;
    }
    setCompleted(true);
  }

  function fieldProps(name: keyof ContributionDraft, hint = false) {
    return {
      id: `contribution-${name}`,
      name,
      form: "contribution-form",
      value: draft[name],
      onChange: (event: { target: { value: string } }) => updateField(name, event.target.value),
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": [hint ? `contribution-${name}-hint` : "", errors[name] ? `contribution-${name}-error` : ""].filter(Boolean).join(" ") || undefined,
      className: "field",
    };
  }

  const errorEntries = Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return <fieldset disabled={!interactive} className="min-w-0 space-y-6 sm:space-y-8">
    <legend className="sr-only">Preparación local de un aporte académico</legend>
    {/* All controls are explicitly associated; the PDF reader owns a separate search form. */}
    <form id="contribution-form" aria-label="Simulación local de aporte" noValidate onSubmit={simulate} />
    {errorEntries.length ? <div ref={errorSummary} tabIndex={-1} role="alert" aria-labelledby="contribution-errors-heading" className="rounded-xl border border-destructive bg-card p-5 sm:p-6">
      <h2 id="contribution-errors-heading" className="text-lg font-semibold text-destructive">Revisa estos datos para continuar</h2>
      <p className="mt-1 text-sm">Tus datos y el archivo seleccionado se conservan en esta página.</p>
      <ul className="mt-3 list-inside list-disc text-sm">{errorEntries.map(([field, message]) => <li key={field}><a className="text-link inline-block min-h-11 py-2" href={`#contribution-${field}`} onClick={(event) => { event.preventDefault(); document.getElementById(`contribution-${field}`)?.focus(); }}>{message}</a></li>)}</ul>
    </div> : null}

    <ContributionSection number={1} title="Elige el ramo" description="Ubica el material en su ramo, sin cambiar su semestre curricular.">
      {invalidSelectionLink ? <p role="status" className="mb-4 rounded-lg bg-muted p-3 text-sm">El enlace no identifica un único ramo activo de demostración. Selecciona uno para continuar.</p> : null}
      <ContributionCoursePicker courses={courses} value={draft.courseId} onChange={(value) => updateField("courseId", value)} error={errors.courseId} />
    </ContributionSection>

    <ContributionSection number={2} title="Describe el material" description="Usa el período en que se dictó el curso, no la fecha de subida ni el semestre de malla.">
      <div className="grid gap-6 sm:grid-cols-2">
        <ContributionField name="category" label="Tipo de material" error={errors.category}><select {...fieldProps("category")} required><option value="">Selecciona un tipo</option><option value="listado">Listado</option><option value="apunte">Apunte</option><option value="certamen">Certamen</option></select></ContributionField>
        {draft.category || draft.documentNumber || errors.documentNumber ? <ContributionField name="documentNumber" label="Número del documento" optional={draft.category !== "listado" && draft.category !== "certamen"} error={errors.documentNumber} hint={draft.category === "apunte" ? "Déjalo vacío si el apunte no tiene número." : "El número de listado o certamen, entre 1 y 999."}><input {...fieldProps("documentNumber", true)} type="text" inputMode="numeric" required={draft.category === "listado" || draft.category === "certamen"} placeholder={draft.category === "apunte" ? "Sin número" : "Por ejemplo: 2"} /></ContributionField> : null}
        <ContributionField name="academicYear" label="Año académico" error={errors.academicYear} hint="Año en que se utilizó el material (1900–2100)."><input {...fieldProps("academicYear", true)} type="text" inputMode="numeric" required placeholder="Por ejemplo: 2024" /></ContributionField>
        <ContributionField name="academicTerm" label="Semestre académico" error={errors.academicTerm} hint="1 o 2: período real del curso, independiente del semestre curricular."><select {...fieldProps("academicTerm", true)} required><option value="">Selecciona un semestre</option><option value="1">1 · Primer semestre</option><option value="2">2 · Segundo semestre</option></select></ContributionField>
        <div className="sm:col-span-2"><ContributionField name="title" label="Título descriptivo" optional error={errors.title} hint="Información secundaria; no reemplaza el nombre público normalizado."><input {...fieldProps("title", true)} maxLength={200} placeholder="Por ejemplo: Límites y continuidad" /></ContributionField></div>
        <ContributionField name="section" label="Sección" optional error={errors.section}><input {...fieldProps("section")} maxLength={80} /></ContributionField>
        <ContributionField name="instructor" label="Profesor o profesora" optional error={errors.instructor}><input {...fieldProps("instructor")} maxLength={120} /></ContributionField>
        <ContributionField name="version" label="Versión" optional error={errors.version}><input {...fieldProps("version")} maxLength={80} placeholder="Por ejemplo: A" /></ContributionField>
      </div>
      <div className="mt-6 rounded-lg border border-border bg-muted p-4" aria-live="polite" aria-atomic="true"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre público normalizado</p><p className="mt-1 font-semibold">{displayName ?? "Completa ramo, tipo, número si corresponde y período académico."}</p><p className="mt-2 text-sm text-muted-foreground">Nunca se obtiene del nombre original del archivo.</p></div>
    </ContributionSection>

    <ContributionSection number={3} title="Selecciona y revisa el archivo" description="La previsualización es local. El archivo no se sube ni se incorpora al catálogo.">
      <ContributionFilePicker file={selectedFile?.file ?? null} error={visibleFileError} onFiles={selectFiles} onRemove={removeFile} />
      <p className="mt-3 text-sm text-muted-foreground">Se comprueban tamaño, extensión, tipo declarado y firma mínima para la demo. Esto no garantiza seguridad ni reemplaza la validación futura del servidor.</p>
      {checkingFile ? <p role="status" className="mt-3 text-sm">Comprobando el archivo en tu dispositivo…</p> : null}
      {selectedFile ? <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Previsualización local</h3><Button type="button" variant="outline" className="min-h-11" aria-expanded={previewOpen} aria-controls="contribution-preview" onClick={() => { if (!previewOpen) setPreviewStatus("loading"); setPreviewOpen((current) => !current); }}>{previewOpen ? "Cerrar previsualización" : "Abrir previsualización"}</Button></div>
        <div id="contribution-preview">{previewOpen ? <LocalFilePreview key={selectedFile.revision} file={selectedFile.file} kind={selectedFile.kind} title={displayName ?? "Material local de demostración"} onStatusChange={onPreviewStatusChange} /> : <p className="text-sm text-muted-foreground">Previsualización cerrada. El archivo permanece seleccionado solo en memoria.</p>}</div>
      </div> : null}
    </ContributionSection>

    <ContributionSection number={4} title="Revisa y simula el aporte" description="Esta demostración no crea un envío, un estado pendiente ni una publicación.">
      <div className="rounded-lg bg-muted p-4 sm:p-5"><Badge>Resumen local</Badge><h3 className="mt-3 text-lg font-semibold">{displayName ?? "Nombre pendiente de completar"}</h3><dl className="mt-3 space-y-2 text-sm [overflow-wrap:anywhere]"><div><dt className="font-medium">Ramo</dt><dd>{selectedCourse?.name ?? "Sin seleccionar"}</dd></div><div><dt className="font-medium">Ubicación curricular</dt><dd>{selectedCourse ? courseClassification(selectedCourse, catalog.electiveAreas) : "Sin seleccionar"}</dd></div><div><dt className="font-medium">Período académico</dt><dd>{validation.ok ? `${validation.value.academicYear}-${validation.value.academicTerm}` : "Por completar"}</dd></div>{draft.title.trim() ? <div><dt className="font-medium">Título descriptivo</dt><dd className="break-words">{draft.title}</dd></div> : null}{draft.section.trim() ? <div><dt className="font-medium">Sección</dt><dd>{draft.section}</dd></div> : null}{draft.instructor.trim() ? <div><dt className="font-medium">Profesor o profesora</dt><dd>{draft.instructor}</dd></div> : null}{draft.version.trim() ? <div><dt className="font-medium">Versión</dt><dd>{draft.version}</dd></div> : null}<div><dt className="font-medium">Archivo local</dt><dd>{selectedFile ? `${selectedFile.kind === "pdf" ? "PDF" : "Imagen"} · ${(selectedFile.file.size / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 2 })} MiB` : "Sin seleccionar"}</dd></div></dl></div>
      <p className="mt-5 text-sm text-muted-foreground">Cuando se active el sistema real, necesitarás una cuenta con correo verificado para aportar. Cada aporte requerirá revisión humana antes de ser público; no habrá acceso público a materiales pendientes o rechazados.</p>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4" htmlFor="contribution-authorization"><input id="contribution-authorization" form="contribution-form" name="authorization" type="checkbox" checked={authorized} onChange={(event) => { setAuthorized(event.target.checked); setErrors((current) => ({ ...current, authorization: undefined })); setCompleted(false); }} aria-invalid={Boolean(errors.authorization)} aria-describedby={errors.authorization ? "contribution-authorization-error" : undefined} className="mt-1 size-5 shrink-0 accent-primary" /><span className="text-sm">Confirmo que soy autor/a o tengo autorización para compartir este material, y que no contiene datos personales que no deba divulgar. <span className="font-medium">(Obligatorio para la simulación)</span></span></label>
      {errors.authorization ? <p id="contribution-authorization-error" className="mt-2 text-sm font-medium text-destructive">{errors.authorization}</p> : null}
      <Button type="submit" form="contribution-form" disabled={!interactive} className="mt-6 min-h-11 w-full px-5 sm:w-auto">Simular aporte</Button>
      <noscript><p className="mt-3 text-sm">Activa JavaScript para preparar esta simulación local. No se enviará el formulario sin él.</p></noscript>
      <p className="mt-3 text-sm text-muted-foreground">Nada se envía ni se guarda de forma persistente. Al recargar o cerrar esta pestaña, se descarta esta selección local.</p>
      {completed ? <div ref={success} tabIndex={-1} role="status" className="mt-6 rounded-xl border border-primary bg-secondary p-5 font-medium text-secondary-foreground">{SUCCESS_MESSAGE}</div> : null}
    </ContributionSection>
  </fieldset>;
}
