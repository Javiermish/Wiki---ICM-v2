"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Expand, Minimize, Minus, MoveHorizontal, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReaderViewport = { width: number; zoom: number };

/** Keeps both scrolling and fullscreen inside the reader, never the page. */
export function ReaderFrame({ title, toolbar, children }: {
  title: string;
  toolbar?: ReactNode;
  children: (viewport: ReaderViewport) => ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(120, Math.floor(entry.contentRect.width - 32)));
    });
    observer.observe(element);
    const update = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);

  async function toggleFullscreen() {
    setNotice("");
    if (!document.fullscreenEnabled || !root.current?.requestFullscreen) {
      setNotice("Este navegador no permite pantalla completa. Puedes ampliar con el zoom del lector.");
      return;
    }
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current.requestFullscreen();
    } catch {
      setNotice("No se pudo abrir pantalla completa. Continúa leyendo aquí con los controles de zoom.");
    }
  }

  function reset() {
    setZoom(1);
    stage.current?.scrollTo({ top: 0, left: 0 });
  }

  return (
    <section ref={root} aria-label={`Lector: ${title}`} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground ${fullscreen ? "h-dvh w-full" : ""}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2" role="group" aria-label="Controles del lector">
        <div className="flex flex-wrap items-center gap-1">
          {toolbar}
          <Button type="button" variant="ghost" className="size-11" aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={toggleFullscreen}>{fullscreen ? <Minimize aria-hidden="true" /> : <Expand aria-hidden="true" />}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" className="size-11" aria-label="Reducir zoom" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.25).toFixed(2)))}><Minus aria-hidden="true" /></Button>
          <output className="min-w-12 text-center text-sm tabular-nums" aria-label="Zoom" aria-live="polite" title="Zoom respecto del ajuste al ancho">{Math.round(zoom * 100)}%</output>
          <Button type="button" variant="ghost" className="size-11" aria-label="Aumentar zoom" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, +(value + 0.25).toFixed(2)))}><Plus aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => { setZoom(1); stage.current?.scrollTo({ left: 0 }); }} aria-label="Ajustar al ancho"><MoveHorizontal aria-hidden="true" /><span>Ajustar</span></Button>
          <Button type="button" variant="ghost" className="size-11" onClick={reset} aria-label="Restablecer zoom y posición" title="Restablecer zoom y posición"><RotateCcw aria-hidden="true" /></Button>
        </div>
      </div>
      <p role="status" className={notice ? "px-4 py-2 text-sm" : "sr-only"}>{notice}</p>
      <div ref={stage} tabIndex={0} role="region" aria-label="Documento; desplázate para leer" style={{ outlineOffset: -3 }} className={`min-h-72 min-w-0 overflow-auto overscroll-contain bg-muted p-4 focus-visible:outline-2 focus-visible:outline-ring ${fullscreen ? "min-h-0 flex-1" : "max-h-[75dvh]"}`}>
        {children({ width, zoom })}
      </div>
    </section>
  );
}
