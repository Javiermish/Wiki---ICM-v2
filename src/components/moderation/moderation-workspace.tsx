"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import { DocumentReader } from "@/components/materials/document-reader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moderationMaterialName, proposalInput, type ModerationEvent } from "@/domain/moderation";
import { validateCourseInput } from "@/domain/course-management";
import { courseClassification, normalizeSearch, publicMaterialById } from "@/lib/catalog/query";
import { MaterialMetadataEditor, RequestMetadataEditor } from "./metadata-editors";
import { useModeration } from "./moderation-provider";
import { ReviewActions } from "./review-actions";

const statuses: Record<string, string> = { pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado", open: "Abierto", resolved: "Resuelto" };
const actions = { submitted: "Entrada local", "metadata-corrected": "Corrección de metadatos", approved: "Aprobación demo", rejected: "Rechazo demo", resolved: "Resolución demo" };

function History({ events }: { events: readonly ModerationEvent[] }) {
  function valueLabel(value: ModerationEvent["next"]) {
    return typeof value === "string" ? statuses[value] ?? value : value === null ? "Sin registro previo" : JSON.stringify(value);
  }
  return <details className="mt-4 border-t border-border pt-3">
    <summary className="min-h-11 py-2 text-sm font-semibold text-primary">Historial ficticio y local ({events.length})</summary>
    <p className="mt-2 text-sm text-muted-foreground">No acredita una revisión humana ni una identidad. Actor DEMO: ninguno (null). Fechas de ejemplo o del navegador; no son auditoría de servidor.</p>
    {events.length ? <ol className="mt-3 space-y-4 text-sm">{[...events].reverse().map((event) => <li key={event.id} className="rounded-lg bg-muted p-4 [overflow-wrap:anywhere]">
      <p className="font-semibold">{actions[event.action]}</p>
      <dl className="mt-2 space-y-1"><div><dt className="inline font-semibold">Recurso: </dt><dd className="inline">{event.resourceType} · {event.resourceId}</dd></div><div><dt className="inline font-semibold">Anterior: </dt><dd className="inline">{valueLabel(event.previous)}</dd></div><div><dt className="inline font-semibold">Nuevo: </dt><dd className="inline">{valueLabel(event.next)}</dd></div><div><dt className="inline font-semibold">Motivo: </dt><dd className="inline whitespace-pre-wrap">{event.reason || "Sin notas opcionales"}</dd></div><div><dt className="inline font-semibold">Fecha: </dt><dd className="inline"><time dateTime={event.happenedAt}>{event.happenedAt}</time></dd></div><div><dt className="inline font-semibold">Actor: </dt><dd className="inline">{event.actorId ?? "null · demo sin sesión"}</dd></div></dl>
    </li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">Todavía no hay decisiones ni correcciones locales para esta muestra.</p>}
  </details>;
}

function QueueSection<T extends { readonly id: string; readonly status: string }>({ id, title, description, items, initialStatus, searchText, render, extra }: {
  id: string; title: string; description: string; items: readonly T[]; initialStatus: string;
  searchText: (item: T) => string; render: (item: T) => ReactNode; extra?: ReactNode;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [query, setQuery] = useState("");
  const availableStatuses = initialStatus === "open" ? ["open", "resolved"] : ["pending", "approved", "rejected"];
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const filtered = items.filter((item) => (status === "all" || item.status === status) && words.every((word) => normalizeSearch(searchText(item)).includes(word)));
  return <section id={id} aria-labelledby={`${id}-heading`} className="space-y-5">
    <div><h2 id={`${id}-heading`} className="text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>{extra}</div>
    <div role="search" aria-label={`Filtrar ${title.toLowerCase()}`} className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[1fr_auto]">
      <div><label htmlFor={`${id}-query`} className="mb-2 block text-sm font-semibold">Buscar {title.toLowerCase()}</label><input id={`${id}-query`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field" /></div>
      <div><label htmlFor={`${id}-status`} className="mb-2 block text-sm font-semibold">Estado de {title.toLowerCase()}</label><select id={`${id}-status`} value={status} onChange={(event) => setStatus(event.target.value)} className="field"><option value="all">Todos los estados</option>{availableStatuses.map((value) => <option key={value} value={value}>{statuses[value]}</option>)}</select></div>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{filtered.length} de {items.length} registros DEMO con estos filtros.</p>
    {filtered.length ? <ul className="space-y-4">{filtered.map((item) => <li key={item.id}>{render(item)}</li>)}</ul> : <div className="rounded-xl border border-dashed border-border bg-card p-6"><h3 className="font-semibold">No hay {title.toLowerCase()} con estos filtros</h3><p className="mt-2 text-sm text-muted-foreground">La cola puede estar vacía después de una decisión local. Consulta otros estados o limpia la búsqueda.</p><Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => { setQuery(""); setStatus("all"); }}>Ver todos los estados</Button></div>}
  </section>;
}

export function ModerationWorkspace({ showCourseRequests = true }: { showCourseRequests?: boolean }) {
  const { catalog } = useCourseCatalog();
  const { snapshot, service } = useModeration();
  const [notice, setNotice] = useState("");
  const [noticeRevision, setNoticeRevision] = useState(0);
  const feedback = useRef<HTMLDivElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setInteractive(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (noticeRevision) feedback.current?.focus(); }, [noticeRevision]);
  function done(message: string) { setNotice(message); setNoticeRevision((value) => value + 1); }
  function history(type: ModerationEvent["resourceType"], id: string) { return snapshot.events.filter((event) => event.resourceType === type && event.resourceId === id); }
  const outstanding = { materials: snapshot.materials.filter((item) => item.status === "pending").length, requests: snapshot.requests.filter((item) => item.status === "pending").length, reports: snapshot.reports.filter((item) => item.status === "open").length };

  return <div className="space-y-8">
    <nav aria-label="Apartados de moderación DEMO" className="flex flex-wrap gap-3"><a className="text-link inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4" href="#materiales-revision">Materiales DEMO · {outstanding.materials} pendientes</a>{showCourseRequests ? <a className="text-link inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4" href="#solicitudes">Solicitudes DEMO · {outstanding.requests} pendientes</a> : null}<a className="text-link inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4" href="#reportes">Reportes DEMO · {outstanding.reports} abiertos</a></nav>
    <div ref={feedback} tabIndex={-1} role="status" className={notice ? "rounded-xl border border-primary bg-secondary p-5 text-sm text-secondary-foreground" : "sr-only"}>{notice}</div>
    <noscript><p className="rounded-xl border border-border bg-muted p-5">Activa JavaScript para practicar decisiones locales. Sin JavaScript los controles están deshabilitados; no hay envíos ni cambios.</p></noscript>
    <fieldset disabled={!interactive} className="min-w-0 space-y-12"><legend className="sr-only">Colas públicas de demostración, sin permisos efectivos</legend>
      <QueueSection id="materiales-revision" title="Materiales" description="Registros SINTÉTICOS independientes del catálogo. Aprobar solo cambia esta cola; jamás añade documentos ni archivos a la biblioteca pública." items={snapshot.materials} initialStatus="pending" searchText={(material) => `${material.id} ${moderationMaterialName(material)} ${material.metadata.title ?? ""} ${catalog.courses.find((course) => course.id === material.metadata.courseId)?.name ?? ""}`}
        render={(material) => {
          const course = catalog.courses.find((item) => item.id === material.metadata.courseId);
          const metadata = material.metadata;
          return <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
            <Badge>{statuses[material.status]} · sintético</Badge><h3 className="mt-3 text-xl font-semibold">{moderationMaterialName(material)}</h3><p className="mt-2 text-sm text-muted-foreground">{course?.name ?? "Ramo no disponible"} · {course ? courseClassification(course, catalog.electiveAreas) : "Sin ubicación"}</p>
            <details className="mt-4"><summary className="min-h-11 py-2 text-sm font-semibold text-primary">Consultar metadatos sintéticos</summary><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 [overflow-wrap:anywhere]"><div><dt className="font-semibold">ID solo de revisión</dt><dd>{material.id}</dd></div><div><dt className="font-semibold">Período académico (no malla)</dt><dd>{metadata.academicYear}-{metadata.academicTerm}</dd></div><div><dt className="font-semibold">Título secundario</dt><dd>{metadata.title || "Sin título secundario"}</dd></div><div><dt className="font-semibold">Sección / profesor / versión</dt><dd>{[metadata.section, metadata.instructor, metadata.version].filter(Boolean).join(" · ") || "Sin datos opcionales"}</dd></div><div><dt className="font-semibold">Fecha ficticia de entrada</dt><dd><time dateTime={material.createdAt}>{material.createdAt}</time></dd></div><div><dt className="font-semibold">Notas de revisión</dt><dd className="whitespace-pre-wrap">{material.reviewNotes || "Sin notas"}</dd></div></dl></details>
            <Button type="button" variant="outline" className="mt-3 min-h-11" aria-expanded={previewId === material.id} aria-controls={previewId === material.id ? `${material.id}-preview` : undefined} onClick={() => setPreviewId((current) => current === material.id ? null : material.id)}>{previewId === material.id ? "Cerrar muestra pública" : "Ver muestra pública (no es el envío)"}</Button>
            {previewId === material.id ? <div id={`${material.id}-preview`} className="mt-4"><p className="mb-3 rounded-lg bg-muted p-4 text-sm"><strong>Solo muestra original ya pública.</strong> Este PDF fue creado para el prototipo. No corresponde al registro pendiente, no representa un aporte privado ni una evaluación oficial. No hay archivos pendientes en esta demo.</p><DocumentReader file={{ kind: "pdf", url: "/demo/calculo-certamen-demo.pdf" }} title="Muestra pública original de demostración (no es el envío)" /></div> : null}
            {material.status === "pending" ? <><MaterialMetadataEditor material={material} onDone={done} /><ReviewActions resourceName={moderationMaterialName(material)} onReview={(decision) => service.reviewMaterial(material.id, decision)} onDone={done} /></> : null}
            <History events={history("material", material.id)} />
          </article>;
        }} />

      {showCourseRequests ? <QueueSection id="solicitudes" title="Solicitudes de ramos" description="Propuestas regulares o electivas. Se comparan con el catálogo dinámico y con otras solicitudes reservadas. Aprobar NO crea un ramo en esta demo." items={snapshot.requests} initialStatus="pending" extra={<Link href="/gestion/asignaturas#course-form" className="text-link mt-3 inline-flex min-h-11 items-center">Preparar una solicitud DEMO en Gestión</Link>} searchText={(request) => `${request.id} ${request.proposedCourse.name} ${request.proposedCourse.code ?? ""} ${request.proposedCourse.kind} ${catalog.electiveAreas.find((area) => area.id === request.proposedCourse.electiveAreaId)?.name ?? ""}`}
        render={(request) => {
          const proposal = request.proposedCourse;
          const validation = validateCourseInput(proposalInput(proposal), catalog);
          return <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
            <Badge>{statuses[request.status]} · solicitud demo</Badge><h3 className="mt-3 text-xl font-semibold">{proposal.name}</h3>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 [overflow-wrap:anywhere]"><div><dt className="font-semibold">Código</dt><dd>{proposal.code || "Sin código"}</dd></div><div><dt className="font-semibold">Tipo y ubicación</dt><dd>{proposal.kind === "regular" ? `Regular · semestre curricular ${proposal.curricularSemester}` : `Electivo · ${catalog.electiveAreas.find((area) => area.id === proposal.electiveAreaId)?.name ?? "Área no disponible"}`}</dd></div><div className="sm:col-span-2"><dt className="font-semibold">Descripción</dt><dd className="whitespace-pre-wrap">{proposal.description || "Sin descripción"}</dd></div><div><dt className="font-semibold">ID de solicitud</dt><dd>{request.id}</dd></div><div><dt className="font-semibold">Entrada ficticia / local</dt><dd><time dateTime={request.createdAt}>{request.createdAt}</time></dd></div><div className="sm:col-span-2"><dt className="font-semibold">Revisión</dt><dd className="whitespace-pre-wrap">{request.reviewNotes || "Sin notas"} · Ramo resultante: ninguno (demo).</dd></div></dl>
            {validation.duplicates.length ? <aside className="mt-4 rounded-lg bg-muted p-4 text-sm"><h4 className="font-semibold">Posibles duplicados del catálogo actual</h4><p className="mt-1">{validation.duplicates.map((course) => `${course.name}${course.status === "archived" ? " (archivado)" : ""}`).join(", ")}. Coincidencias exactas impiden aprobar; aproximadas son avisos.</p></aside> : null}
            {request.status === "pending" ? <><RequestMetadataEditor request={request} onDone={done} /><ReviewActions resourceName={proposal.name} onReview={(decision) => service.reviewCourseRequest(request.id, decision)} onDone={done} /></> : null}
            <History events={history("course-request", request.id)} />
          </article>;
        }} /> : null}

      <QueueSection id="reportes" title="Reportes" description="El mismo formulario de reporte de las fichas alimenta esta cola en memoria. Resolver requiere una explicación y nunca retira ni modifica el material público." items={snapshot.reports} initialStatus="open" searchText={(report) => { const material = publicMaterialById(catalog, report.materialId); return `${report.id} ${report.materialId} ${report.reason} ${report.description} ${material?.displayName ?? ""} ${material?.course.name ?? ""}`; }}
        render={(report) => {
          const material = publicMaterialById(catalog, report.materialId);
          return <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
            <Badge>{statuses[report.status]} · reporte demo</Badge><h3 className="mt-3 text-xl font-semibold">{report.reason}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{report.description || "Sin descripción adicional."}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 [overflow-wrap:anywhere]"><div><dt className="font-semibold">Material reportado</dt><dd>{material ? <Link href={`/materiales/${material.id}`} className="text-link inline-flex min-h-11 items-center">{material.displayName}</Link> : "Material no disponible"}</dd></div><div><dt className="font-semibold">Ramo y clasificación actual</dt><dd>{material ? `${material.course.name} · ${courseClassification(material.course, catalog.electiveAreas)}` : "Sin datos públicos disponibles"}</dd></div><div><dt className="font-semibold">Período académico</dt><dd>{material?.academicPeriod ?? "No disponible"}</dd></div><div><dt className="font-semibold">ID de material</dt><dd>{report.materialId}</dd></div><div><dt className="font-semibold">Fecha ficticia / local</dt><dd><time dateTime={report.createdAt}>{report.createdAt}</time></dd></div><div><dt className="font-semibold">Resolución</dt><dd className="whitespace-pre-wrap">{report.resolution || "Todavía sin resolver"}</dd></div></dl>
            {report.status === "open" ? <ReviewActions resourceName={`reporte de ${material?.displayName ?? report.materialId}`} onResolve={(explanation) => service.resolveReport(report.id, explanation)} onDone={done} /> : null}
            <History events={history("report", report.id)} />
          </article>;
        }} />
    </fieldset>
  </div>;
}
