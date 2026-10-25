"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PersistentMaterial } from "@/lib/materials/persistent";
import { reviewMaterialAction } from "@/lib/materials/actions";
import { materialDisplayName } from "@/lib/catalog/query";
import { normalizedDownloadName } from "@/lib/materials/file-metadata";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { DocumentReader } from "@/components/materials/document-reader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

function displayName(material: PersistentMaterial) {
  return materialDisplayName({ category: material.category, documentNumber: material.document_number }, { academicYear: material.academic_year, academicTerm: material.academic_term });
}

function MaterialReview({ material }: { material: PersistentMaterial }) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const inFlight = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const approve = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  useEffect(() => { queueMicrotask(() => setInteractive(true)); }, []);
  useEffect(() => { if (decision) confirmation.current?.focus(); }, [decision]);
  useEffect(() => { if (revision) feedback.current?.focus(); }, [revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive || inFlight.current || !decision) return;
    if (!notes.trim() || notes.trim().length > 1000) {
      setError("Indica un motivo de entre 1 y 1000 caracteres.");
      setRevision((value) => value + 1);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await reviewMaterialAction(material.id, decision, notes.trim());
      setMessage(decision === "approved" ? "Material aprobado. La decisión quedó guardada." : "Material rechazado. El motivo quedó guardado para la persona aportante.");
      setDecision(null);
      router.refresh();
    } catch {
      setError("No se pudo confirmar la revisión. Tus notas se conservan. Recarga para comprobar si otra persona ya resolvió este aporte antes de reintentar.");
    } finally { inFlight.current = false; setBusy(false); setRevision((value) => value + 1); }
  }

  return <div className="mt-5">
    <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"} className={error || message ? "mb-4 rounded-lg bg-muted p-4 text-sm" : "sr-only"}>{error || message}</p>
    <noscript><p>Activa JavaScript para revisar materiales.</p></noscript>
    {!message ? <fieldset disabled={!interactive || busy} aria-busy={busy} className="min-w-0"><legend className="sr-only">Revisión de {displayName(material)}</legend>
      {!decision ? <div className="flex flex-wrap gap-3"><Button ref={approve} className="min-h-11" onClick={() => { setError(""); setDecision("approved"); }}>Aprobar material</Button><Button ref={reject} variant="outline" className="min-h-11" onClick={() => { setError(""); setDecision("rejected"); }}>Rechazar material</Button></div> : <div ref={confirmation} tabIndex={-1} role="group" aria-labelledby={`confirm-material-${material.id}`} className="rounded-xl border border-border bg-muted p-5">
        <h4 id={`confirm-material-${material.id}`} className="font-semibold">¿{decision === "approved" ? "Aprobar" : "Rechazar"} {displayName(material)}?</h4>
        <p className="mt-2 text-sm">{decision === "approved" ? "El archivo quedará disponible públicamente." : "El archivo seguirá sin acceso público y su propietario podrá consultar el motivo."} Esta decisión se registra en servidor y no se puede deshacer desde esta pantalla.</p>
        <form onSubmit={submit} noValidate className="mt-4 space-y-4"><label htmlFor={`material-notes-${material.id}`} className="block text-sm font-semibold">Motivo de la decisión (obligatorio, hasta 1000 caracteres)</label><textarea id={`material-notes-${material.id}`} required maxLength={1000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `material-review-error-${material.id}` : undefined} className="field form-control" />{error ? <p id={`material-review-error-${material.id}`} className="text-sm text-destructive">{error}</p> : null}<div className="flex flex-wrap gap-3"><Button type="submit" className="min-h-11">{busy ? "Guardando decisión…" : decision === "approved" ? "Confirmar aprobación" : "Confirmar rechazo"}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { const previous = decision; setDecision(null); setError(""); requestAnimationFrame(() => (previous === "approved" ? approve : reject).current?.focus()); }}>Cancelar</Button></div></form>
      </div>}
    </fieldset> : null}
  </div>;
}

function MaterialItem({ material, review }: { material: PersistentMaterial; review: boolean }) {
  const { catalog } = useCourseCatalog();
  const [preview, setPreview] = useState(false);
  const name = displayName(material);
  const course = catalog.courses.find((item) => item.id === material.course_id);
  const url = `/api/materiales/${encodeURIComponent(material.id)}/archivo`;
  return <article className="min-w-0 rounded-xl border border-border bg-card p-5 [overflow-wrap:anywhere] sm:p-6">
    <Badge>{({ pending: "Pendiente de revisión", approved: "Aprobado", rejected: "Rechazado" })[material.status]}</Badge>
    <h3 className="mt-3 text-xl font-semibold">{name}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{course?.name ?? "Ramo no disponible en el catálogo activo"} · Período académico {material.academic_year}-{material.academic_term}</p>
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      {[["Título descriptivo", material.title], ["Descripción", material.description], ["Sección", material.section], ["Profesor o profesora", material.instructor], ["Versión", material.version]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}
      <div><dt className="font-semibold">Archivo</dt><dd>{material.extension.toUpperCase()} · {(material.bytes / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 2 })} MiB</dd></div>
      <div><dt className="font-semibold">Enviado</dt><dd><time dateTime={material.submitted_at}>{material.submitted_at}</time></dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold">Notas de revisión</dt><dd className="whitespace-pre-wrap">{material.review_notes || "Sin notas de revisión"}</dd></div>
      {material.reviewed_at ? <div><dt className="font-semibold">Revisado</dt><dd><time dateTime={material.reviewed_at}>{material.reviewed_at}</time></dd></div> : null}
    </dl>
    {material.upload_state === "ready" ? <><div className="mt-5 flex flex-wrap gap-4"><Button type="button" variant="outline" className="min-h-11" aria-expanded={preview} aria-controls={`material-preview-${material.id}`} onClick={() => setPreview((value) => !value)}>{preview ? "Cerrar previsualización" : "Previsualizar archivo"}</Button><a href={`${url}?descargar=1`} download={normalizedDownloadName(name, material.extension)} className="text-link inline-flex min-h-11 items-center">Descargar {name}</a></div><div id={`material-preview-${material.id}`} className={preview ? "mt-5" : undefined}>{preview ? <DocumentReader file={{ kind: material.mime_type === "application/pdf" ? "pdf" : "image", url }} title={name} /> : null}</div></> : <p role="status" className="mt-5 rounded-lg bg-muted p-4 text-sm">{material.upload_state === "failed" ? "La carga del archivo falló. No está disponible para lectura ni revisión." : "Archivo en proceso de carga. Aún no está disponible para lectura ni revisión."}</p>}
    {review && material.status === "pending" && material.upload_state === "ready" ? <MaterialReview material={material} /> : null}
  </article>;
}

export function PersistentMaterialList({ materials, review = false, page = 1 }: { materials: readonly PersistentMaterial[]; review?: boolean; page?: number }) {
  const pageHref = (number: number) => review ? `/moderacion?materialesPagina=${number}#materiales-reales` : `/mis-aportes?pagina=${number}`;
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Página {page} · {materials.length} aportes en esta página.</p><nav aria-label="Páginas de materiales" className="flex flex-wrap gap-5">{page > 1 ? <Link href={pageHref(page - 1)} className="text-link inline-flex min-h-11 items-center">Página anterior de materiales</Link> : null}{materials.length === 50 ? <Link href={pageHref(page + 1)} className="text-link inline-flex min-h-11 items-center">Página siguiente de materiales</Link> : null}</nav>{materials.length ? <ul className="space-y-5">{materials.map((material) => <li key={material.id}><MaterialItem material={material} review={review} /></li>)}</ul> : <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">{page > 1 ? "No hay más aportes en esta página. Vuelve a la página anterior." : review ? "No hay materiales listos pendientes de revisión." : "Todavía no tienes aportes guardados."}</p>}</div>;
}
