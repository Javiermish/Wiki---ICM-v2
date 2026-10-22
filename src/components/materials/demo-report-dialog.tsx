"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModeration } from "@/components/moderation/moderation-provider";
import { reportReasons } from "@/domain/moderation";

export function DemoReportDialog({ materialId, materialName }: { materialId: string; materialName: string }) {
  const { service } = useModeration();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error || reviewed) feedback.current?.focus(); }, [error, reviewed]);

  function open() {
    setReviewed(false);
    setError("");
    dialog.current?.showModal();
  }
  function close() { if (!inFlight.current) dialog.current?.close(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await service.submitReport({ materialId, reason: String(data.get("reason") ?? ""), description: String(data.get("description") ?? "") });
      setReviewed(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo añadir el reporte local. Inténtalo otra vez.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <>
    <Button ref={trigger} type="button" variant="outline" className="min-h-11" onClick={open}><Flag aria-hidden="true" />Reportar material</Button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-notice`} onCancel={(event) => { if (inFlight.current) event.preventDefault(); }} onClose={() => { form.current?.reset(); trigger.current?.focus(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/60">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-xl font-semibold">Reportar material</h2><Badge>Demo local</Badge></div>
      <p className="mb-3 break-words font-medium">{materialName}</p>
      <p id={`${id}-notice`} className="mb-5 text-sm text-muted-foreground">Demostración sin backend. Añade un reporte solo a la cola en memoria de esta pestaña para practicar su revisión en Moderación. No se envía a nadie y se pierde al recargar, no al cerrar este diálogo.</p>
      <form ref={form} key={String(reviewed)} onSubmit={submit} aria-busy={busy} className="space-y-4">
        {error ? <p ref={feedback} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{error}</p> : null}
        {reviewed ? <><p ref={feedback} tabIndex={-1} role="status" className="rounded-lg bg-secondary p-4 text-secondary-foreground">Reporte añadido únicamente a la cola DEMO local. No se envió ni guardó en un servidor.</p><Link href="/moderacion#reportes" prefetch={false} onClick={close} className="text-link inline-flex min-h-11 items-center">Consultar reportes de la demo</Link></> : <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Datos del reporte de demostración</legend>
          <div><label htmlFor={`${id}-reason`} className="mb-1 block font-medium">Motivo</label><select autoFocus required id={`${id}-reason`} name="reason" className="field"><option value="">Selecciona un motivo</option>{reportReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
          <div><label htmlFor={`${id}-description`} className="mb-1 block font-medium">Descripción <span className="font-normal text-muted-foreground">(opcional)</span></label><textarea id={`${id}-description`} name="description" rows={4} maxLength={2000} className="field focus-visible:outline-2 focus-visible:outline-ring" placeholder="Explica el problema sin incluir datos personales." /></div>
        </fieldset>}
        <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} type="button" variant="outline" className="min-h-11" onClick={close}>{reviewed ? "Cerrar" : "Cancelar"}</Button>{!reviewed ? <Button disabled={busy} type="submit" className="min-h-11">{busy ? "Añadiendo…" : "Probar reporte demo"}</Button> : null}</div>
      </form>
    </dialog>
  </>;
}
