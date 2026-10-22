"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewDecision } from "@/domain/moderation";

/** Confirmación explícita compartida; nunca decide al pulsar el primer botón. */
export function ReviewActions({ resourceName, onReview, onResolve, onDone }: {
  resourceName: string;
  onReview?: (decision: ReviewDecision) => Promise<unknown>;
  onResolve?: (explanation: string) => Promise<unknown>;
  onDone: (message: string) => void;
}) {
  const id = useId();
  const [action, setAction] = useState<ReviewDecision["action"] | "resolved" | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const errorControl = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (action) confirmation.current?.focus(); }, [action]);
  useEffect(() => { if (error) errorControl.current?.focus(); }, [error]);
  const verb = action === "approved" ? "aprobar" : action === "rejected" ? "rechazar" : "resolver";

  function open(next: NonNullable<typeof action>, button: HTMLButtonElement) {
    trigger.current = button;
    setNotes(""); setError(""); setAction(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (action === "resolved") await onResolve?.(notes);
      else await onReview?.({ action, notes });
      setAction(null);
      onDone(`${resourceName}: ${action === "approved" ? "aprobación" : action === "rejected" ? "rechazo" : "resolución"} registrada solo en la DEMO. No publica, crea ni retira recursos del catálogo. Se pierde al recargar.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo aplicar la decisión local. Inténtalo otra vez.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="mt-5">
    <div className="flex flex-wrap gap-2">
      {onReview ? <><Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={(event) => open("approved", event.currentTarget)}>Aprobar demo</Button><Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={(event) => open("rejected", event.currentTarget)}>Rechazar demo</Button></> : <Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={(event) => open("resolved", event.currentTarget)}>Resolver reporte demo</Button>}
    </div>
    {action ? <div ref={confirmation} tabIndex={-1} role="group" aria-labelledby={`${id}-title`} className="mt-4 rounded-xl border border-primary bg-muted p-4 sm:p-5">
      <h4 id={`${id}-title`} className="font-semibold">Confirmar: {verb} {resourceName}</h4>
      <p className="mt-2 text-sm text-muted-foreground">Solo cambia la cola de esta pestaña. No se publica ningún material, no se crea un ramo ni se despublica el material reportado. La decisión no puede repetirse en esta demo.</p>
      <form onSubmit={submit} aria-busy={busy} className="mt-4 space-y-4">
        {error ? <p ref={errorControl} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
        <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Confirmación de decisión local</legend>
          <div><label htmlFor={`${id}-notes`} className="mb-2 block text-sm font-semibold">{action === "approved" ? "Notas (opcional)" : action === "rejected" ? "Motivo de rechazo (obligatorio)" : "Explicación de la resolución (obligatoria)"}</label><textarea autoFocus id={`${id}-notes`} className="field" rows={3} required={action !== "approved"} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11">{busy ? "Aplicando…" : `Confirmar ${verb} en demo`}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { setAction(null); trigger.current?.focus(); }}>Cancelar</Button></div>
        </fieldset>
      </form>
    </div> : null}
  </div>;
}
