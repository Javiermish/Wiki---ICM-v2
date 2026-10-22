"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const reasons = ["Archivo incorrecto", "Documento ilegible", "Documento duplicado", "Clasificación equivocada", "Problema de derechos o autorización", "Otro motivo"] as const;

export function DemoReportDialog({ materialName }: { materialName: string }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [reviewed, setReviewed] = useState(false);

  function open() {
    setReviewed(false);
    dialog.current?.showModal();
  }
  function close() { dialog.current?.close(); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewed(true);
  }

  return <>
    <Button ref={trigger} type="button" variant="outline" className="min-h-11" onClick={open}><Flag aria-hidden="true" />Reportar material</Button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-notice`} onClose={() => { form.current?.reset(); trigger.current?.focus(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/60">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-xl font-semibold">Reportar material</h2><Badge>Demo local</Badge></div>
      <p className="mb-3 break-words font-medium">{materialName}</p>
      <p id={`${id}-notice`} className="mb-5 text-sm text-muted-foreground">Este formulario es una demostración. Nunca envía reportes reales: no usa red ni almacenamiento. La información se descarta al cerrar.</p>
      <form ref={form} key={String(reviewed)} onSubmit={submit} className="space-y-4">
        {reviewed ? <p role="status" className="rounded-lg bg-secondary p-4 text-secondary-foreground">Demostración revisada. No se envió ni se guardó ningún reporte.</p> : <>
          <div><label htmlFor={`${id}-reason`} className="mb-1 block font-medium">Motivo</label><select autoFocus required id={`${id}-reason`} name="reason" className="field"><option value="">Selecciona un motivo</option>{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
          <div><label htmlFor={`${id}-description`} className="mb-1 block font-medium">Descripción <span className="font-normal text-muted-foreground">(opcional)</span></label><textarea id={`${id}-description`} name="description" rows={4} maxLength={2000} className="field focus-visible:outline-2 focus-visible:outline-ring" placeholder="Explica el problema sin incluir datos personales." /></div>
        </>}
        <div className="flex flex-wrap justify-end gap-2"><Button autoFocus={reviewed} type="button" variant="outline" className="min-h-11" onClick={close}>{reviewed ? "Cerrar" : "Cancelar"}</Button>{!reviewed ? <Button type="submit" className="min-h-11">Probar reporte demo</Button> : null}</div>
      </form>
    </dialog>
  </>;
}
