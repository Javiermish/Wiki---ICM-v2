"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requestPageSize, type RequestStatusFilter } from "@/lib/catalog/request-pagination";
import type { ElectiveArea, PublicCatalog } from "@/domain/catalog";
import { validateCourseInput, type CourseInput } from "@/domain/course-management";
import { submitCourseRequestAction, reviewCourseRequestAction } from "@/lib/catalog/actions";
import type { PersistentCourseRequest } from "@/lib/catalog/persistent";
import { Button } from "@/components/ui/button";
import { CourseInputFields } from "./course-input-fields";

const emptyInput: CourseInput = { name: "", code: "", kind: "regular", curricularSemester: "", electiveAreaId: "", description: "" };
const statusLabels: Record<string, string> = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

export function CourseRequestForm({ catalog }: { catalog: PublicCatalog }) {
  const router = useRouter();
  const [input, setInput] = useState<CourseInput>(emptyInput);
  const [justification, setJustification] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof CourseInput | "justification", string>>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const inFlight = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const [feedbackRevision, setFeedbackRevision] = useState(0);
  useEffect(() => { queueMicrotask(() => setInteractive(true)); }, []);
  useEffect(() => { if (feedbackRevision) feedback.current?.focus(); }, [feedbackRevision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive || inFlight.current) return;
    setMessage("");
    const validation = validateCourseInput(input, catalog);
    const nextErrors = { ...validation.errors, ...(justification.trim().length < 10 ? { justification: "Explica la solicitud con al menos 10 caracteres." } : {}) };
    setErrors(nextErrors);
    setError("");
    if (Object.values(nextErrors).some(Boolean)) {
      setError("Revisa los campos indicados.");
      setFeedbackRevision((value) => value + 1);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await submitCourseRequestAction(input, justification);
      setInput({ ...emptyInput });
      setJustification("");
      setMessage("Solicitud guardada. Queda pendiente de revisión humana; aún no se ha creado un ramo.");
      router.refresh();
    } catch {
      setError("No se pudo enviar la solicitud. Tus datos se conservan; comprueba tu sesión y los datos antes de reintentar.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setFeedbackRevision((value) => value + 1);
    }
  }

  return <section id="course-form" aria-labelledby="request-form-title" className="rounded-xl border border-border bg-card p-5 sm:p-8">
    <h2 id="request-form-title" className="text-2xl font-semibold">Proponer un ramo</h2>
    <noscript><p className="mt-4">Activa JavaScript para enviar una solicitud. No se enviará sin JavaScript.</p></noscript>
    <div ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={error || message ? "mt-5 rounded-xl border border-border bg-muted p-5 text-sm" : "sr-only"}>
      {error || message}
      {Object.entries(errors).filter(([, value]) => value).map(([key, value]) => <a key={key} href={`#request-${key}`} className="text-link mt-2 block min-h-11 py-2" onClick={(event) => { event.preventDefault(); document.getElementById(`request-${key}`)?.focus(); }}>{value}</a>)}
    </div>
    <form noValidate onSubmit={submit} aria-labelledby="request-form-title" aria-busy={busy} className="mt-6">
      <fieldset disabled={!interactive || busy} className="min-w-0 space-y-6"><legend className="sr-only">Datos de la solicitud</legend>
        <CourseInputFields prefix="request" input={input} errors={errors} areas={catalog.electiveAreas} onChange={(field, value) => { setInput((current) => ({ ...current, [field]: value })); setErrors({}); setMessage(""); }} />
        <div><label htmlFor="request-justification" className="mb-2 block text-sm font-semibold">Justificación</label><textarea id="request-justification" required maxLength={2000} rows={4} value={justification} onChange={(event) => setJustification(event.target.value)} className="field form-control" aria-invalid={Boolean(errors.justification)} aria-describedby={errors.justification ? "request-justification-error" : undefined} />{errors.justification ? <p id="request-justification-error" className="mt-2 text-sm text-destructive">{errors.justification}</p> : null}</div>
        <p className="text-sm text-muted-foreground">No incluyas datos personales ni archivos. El semestre curricular ubica el ramo en la malla, no determina el período de sus materiales.</p>
        <Button type="submit" disabled={!interactive || busy} className="min-h-11">{busy ? "Enviando solicitud…" : "Enviar solicitud a revisión"}</Button>
      </fieldset>
    </form>
  </section>;
}

function RequestReview({ request }: { request: PersistentCourseRequest }) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const approveButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { queueMicrotask(() => setInteractive(true)); }, []);
  useEffect(() => { if (decision) confirmation.current?.focus(); }, [decision]);
  useEffect(() => { if (revision) feedback.current?.focus(); }, [revision]);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive || inFlight.current || !decision) return;
    if (!notes.trim()) {
      setError("Indica el motivo de la decisión."); setRevision((value) => value + 1); return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await reviewCourseRequestAction(request.id, decision, notes);
      setMessage(decision === "approved" ? "Solicitud aprobada y ramo creado en el catálogo." : "Solicitud rechazada. La decisión y las notas se han guardado.");
      setDecision(null);
      router.refresh();
    } catch {
      setError("No se pudo guardar la revisión. Conservamos tus notas. La solicitud puede haber sido resuelta o coincidir con otro ramo; recarga para comprobar su estado antes de reintentar.");
    } finally { inFlight.current = false; setBusy(false); setRevision((value) => value + 1); }
  }

  return <div className="mt-5">
    <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={error || message ? "mb-4 rounded-lg bg-muted p-4 text-sm" : "sr-only"}>{error || message}</p>
    <noscript><p>Activa JavaScript para revisar solicitudes.</p></noscript>
    {!message ? <fieldset disabled={!interactive || busy} aria-busy={busy} className="min-w-0"><legend className="sr-only">Revisar solicitud de {request.name}</legend>
      {!decision ? <div className="flex flex-wrap gap-3"><Button ref={approveButton} type="button" className="min-h-11" onClick={() => { setError(""); setDecision("approved"); }}>Aprobar solicitud</Button><Button ref={rejectButton} type="button" variant="outline" className="min-h-11" onClick={() => { setError(""); setDecision("rejected"); }}>Rechazar solicitud</Button></div> : <div ref={confirmation} tabIndex={-1} role="group" aria-labelledby={`confirm-${request.id}`} className="rounded-lg border border-border bg-muted p-5">
        <h4 id={`confirm-${request.id}`} className="font-semibold">¿{decision === "approved" ? "Aprobar" : "Rechazar"} {request.name}?</h4>
        <p className="mt-2 text-sm">{decision === "approved" ? "Se creará un ramo público y se guardará esta decisión. El servidor volverá a comprobar duplicados y estado." : "No se creará un ramo. La persona solicitante podrá consultar el motivo."} La decisión no se puede deshacer desde esta pantalla.</p>
        <form onSubmit={review} className="mt-4 space-y-4"><label htmlFor={`notes-${request.id}`} className="block text-sm font-semibold">Motivo de la decisión (obligatorio, hasta 1000 caracteres)</label><textarea id={`notes-${request.id}`} className="field form-control" rows={3} maxLength={1000} required value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="flex flex-wrap gap-3"><Button type="submit" className="min-h-11">{busy ? "Guardando decisión…" : decision === "approved" ? "Confirmar aprobación" : "Confirmar rechazo"}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { const previous = decision; setDecision(null); setError(""); requestAnimationFrame(() => (previous === "approved" ? approveButton : rejectButton).current?.focus()); }}>Cancelar</Button></div></form>
      </div>}
    </fieldset> : null}
  </div>;
}

export function CourseRequestList({ requests, areas, review = false, page = 1, statusFilter = "all" }: { requests: readonly PersistentCourseRequest[]; areas: readonly ElectiveArea[]; review?: boolean; page?: number; statusFilter?: RequestStatusFilter }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const prefix = review ? "review-requests" : "own-requests";
  const path = review ? "/moderacion" : "/gestion/asignaturas";
  const pageHref = (number: number) => `${path}?estado=${statusFilter}&pagina=${number}#${review ? "solicitudes" : "own-requests-title"}`;
  const filtered = requests.filter((request) => `${request.name} ${request.code ?? ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]"><div><label htmlFor={`${prefix}-search`} className="mb-2 block text-sm font-semibold">Buscar por nombre o código en esta página</label><input id={`${prefix}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field form-control" /></div><div><label htmlFor={`${prefix}-status`} className="mb-2 block text-sm font-semibold">Estado de solicitud</label><select id={`${prefix}-status`} value={statusFilter} onChange={(event) => router.push(`${path}?estado=${event.target.value}&pagina=1`)} className="field form-control"><option value="all">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
    <p role="status" className="text-sm text-muted-foreground">Página {page} · {filtered.length} solicitudes guardadas con estos filtros en esta página.</p>
    <nav aria-label="Páginas de solicitudes" className="flex flex-wrap gap-5">{page > 1 ? <Link href={pageHref(page - 1)} className="text-link inline-flex min-h-11 items-center">Página anterior</Link> : null}{requests.length === requestPageSize ? <Link href={pageHref(page + 1)} className="text-link inline-flex min-h-11 items-center">Página siguiente</Link> : null}</nav>
    {filtered.length ? <ul className="space-y-4">{filtered.map((request) => <li key={request.id}><article className="min-w-0 rounded-xl border border-border bg-card p-5 [overflow-wrap:anywhere] sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{statusLabels[request.status] ?? request.status} · persistente</p><h3 className="mt-2 text-xl font-semibold">{request.name}</h3>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Código</dt><dd>{request.code || "Sin código"}</dd></div><div><dt className="font-semibold">Ubicación</dt><dd>{request.kind === "regular" ? `Semestre curricular ${request.curricular_semester}` : `Electivo · ${areas.find((area) => area.id === request.elective_area_id)?.name ?? "Área no disponible"}`}</dd></div><div className="sm:col-span-2"><dt className="font-semibold">Justificación</dt><dd className="whitespace-pre-wrap">{request.justification}</dd></div><div><dt className="font-semibold">Enviada</dt><dd><time dateTime={request.created_at}>{request.created_at}</time></dd></div><div><dt className="font-semibold">Revisada</dt><dd>{request.reviewed_at ? <time dateTime={request.reviewed_at}>{request.reviewed_at}</time> : "Pendiente de revisión"}</dd></div><div className="sm:col-span-2"><dt className="font-semibold">Notas de revisión</dt><dd className="whitespace-pre-wrap">{request.review_notes || "Sin notas"}</dd></div>{request.resulting_course_id ? <div className="sm:col-span-2"><dt className="font-semibold">ID del ramo creado</dt><dd className="font-mono">{request.resulting_course_id}</dd></div> : null}</dl>
      {review && request.status === "pending" ? <RequestReview request={request} /> : null}
    </article></li>)}</ul> : <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">No hay solicitudes con estos filtros.</p>}
  </div>;
}
