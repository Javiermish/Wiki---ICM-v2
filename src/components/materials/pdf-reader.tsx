"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReaderFrame, type ReaderViewport } from "./reader-frame";
import type { DocumentReaderProps } from "./document-reader";
import { ReaderFailure } from "./reader-feedback";
import { findTextMatches, highlightMatches, MAX_SEARCH_MATCHES, MAX_SEARCH_PAGES, MAX_SEARCH_TEXT, type PdfMatch } from "./pdf-search";
import "react-pdf/dist/Page/TextLayer.css";
import styles from "./reader.module.css";

// Must share the module with Document/Page, so import order cannot overwrite it.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url,
).toString();

const PDF_OPTIONS = {
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  wasmUrl: "/pdfjs/wasm/",
  canvasMaxAreaInBytes: 32_000_000,
  isEvalSupported: false,
};

type PdfSheetProps = ReaderViewport & { page: number; matches: PdfMatch[]; active?: PdfMatch };

function SizedPdfSheet({ pdf, retry, ...props }: PdfSheetProps & { pdf: PDFDocumentProxy; retry: () => void }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // Activity reconnects Effects, not component state. A disposed transport can
    // throw synchronously from getPage(), before returning a Promise.
    void (async () => {
      if (pdf.loadingTask.destroyed) return;
      const loaded = await pdf.getPage(props.page);
      if (cancelled || pdf.loadingTask.destroyed) return;
      const viewport = loaded.getViewport({ scale: 1 });
      const nextRatio = viewport.height / viewport.width;
      if (!Number.isFinite(nextRatio) || nextRatio <= 0) setFailed(true);
      else setRatio(nextRatio);
    })().catch(() => { if (!cancelled && !pdf.loadingTask.destroyed) setFailed(true); });
    return () => { cancelled = true; };
  }, [pdf, props.page]);
  if (failed) return <ReaderFailure retry={retry} />;
  if (ratio === null) return <p role="status">Preparando página…</p>;
  return <PdfSheet {...props} ratio={ratio} />;
}

function PdfSheet({ page, width, zoom, matches, active, ratio }: PdfSheetProps & { ratio: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState(false);
  const [textError, setTextError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const renderWidth = Math.max(1, Math.min(width * zoom, 4096, 4096 / ratio));
  const height = renderWidth * ratio;
  // At most 8M pixels (~32 MB RGBA), 4096px per side, and DPR <= 2.
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(renderWidth, height), Math.sqrt(8_000_000 / (renderWidth * height)));
  const highlight = useCallback(() => {
    const layer = root.current?.querySelector<HTMLElement>(".textLayer");
    if (layer) highlightMatches(layer, matches.filter((match) => match.page === page), active);
  }, [matches, active, page]);
  useEffect(highlight, [highlight]);
  const pageFailed = useCallback(() => { setError(true); setRendering(false); }, []);
  const pageRendered = useCallback(() => setRendering(false), []);
  const textFailed = useCallback(() => setTextError(true), []);

  return <div ref={root} aria-busy={rendering}>
    {rendering ? <p role="status" className="mb-3 text-sm">Renderizando página {page}…</p> : null}
    {textError ? <div className="mb-3 space-y-2 text-sm"><p role="status">No se pudo cargar el texto de esta página. La imagen sigue disponible.</p><Button type="button" variant="outline" className="min-h-11" onClick={() => { setTextError(false); setRendering(true); setAttempt((value) => value + 1); }}>Reintentar texto</Button></div> : null}
    {error ? <ReaderFailure retry={() => { setError(false); setTextError(false); setRendering(true); setAttempt((value) => value + 1); }} /> : <Page
      key={attempt}
      pageNumber={page}
      width={renderWidth}
      devicePixelRatio={dpr}
      suspense={false}
      renderTextLayer
      renderAnnotationLayer={false}
      className={styles.page}
      loading={<p role="status" className="p-4 text-foreground">Cargando página {page}…</p>}
      error={<p role="alert">No se pudo cargar esta página.</p>}
      onLoadError={pageFailed}
      onRenderError={pageFailed}
      onRenderSuccess={pageRendered}
      onGetTextError={textFailed}
      onRenderTextLayerError={textFailed}
      onRenderTextLayerSuccess={highlight}
    />}
    {renderWidth < width * zoom ? <p className="mt-3 text-sm">Ampliación limitada para mantener una lectura estable en este dispositivo.</p> : null}
  </div>;
}

export default function PdfReader({ file, title }: DocumentReaderProps) {
  const id = useId();
  // Retain only inert metadata in React state. Document owns its transport and
  // disposes it when Next's Activity hides this route, even if state survives.
  const [pageCount, setPageCount] = useState<number | null>(null);
  const currentPdf = useRef<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PdfMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const searchRun = useRef(0);

  useEffect(() => () => {
    currentPdf.current = null;
    searchRun.current += 1;
    setPageCount(null);
    setLoading(true);
    setSearching(false);
    setMatches([]);
    setActiveIndex(-1);
    setSearchStatus("");
  }, []);

  const documentLoaded = useCallback((loaded: PDFDocumentProxy) => {
    // React-PDF's success Effect may reconnect before its new load resolves.
    // Never publish a proxy from the previous, already-disposed Effect lifetime.
    if (loaded.loadingTask.destroyed) return;
    currentPdf.current = loaded;
    setPageCount(loaded.numPages);
    setLoading(false);
    setLoadError(false);
  }, []);

  function cancelSearch(message = "Búsqueda cancelada.") {
    searchRun.current += 1;
    setSearching(false);
    setSearchStatus(message);
    setMatches([]);
    setActiveIndex(-1);
  }
  function retry() {
    cancelSearch("");
    currentPdf.current = null;
    setPageCount(null);
    setPage(1);
    setLoading(true);
    setLoadError(false);
    setAttempt((value) => value + 1);
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    const pdf = currentPdf.current;
    if (!pdf || pdf.loadingTask.destroyed || !term) return;
    const run = ++searchRun.current;
    setSearching(true);
    setMatches([]);
    setActiveIndex(-1);
    const found: PdfMatch[] = [];
    let hasText = false;
    let processedText = 0;
    let limited = pdf.numPages > MAX_SEARCH_PAGES;
    try {
      // Extract only text, one page at a time: never create hidden canvases.
      for (let number = 1; number <= Math.min(pdf.numPages, MAX_SEARCH_PAGES); number += 1) {
        if (run !== searchRun.current || pdf.loadingTask.destroyed) return;
        setSearchStatus(`Buscando en página ${number} de ${pdf.numPages}…`);
        const pdfPage = await pdf.getPage(number);
        if (run !== searchRun.current || pdf.loadingTask.destroyed) return;
        const content = await pdfPage.getTextContent();
        if (run !== searchRun.current || pdf.loadingTask.destroyed) return;
        const chunks: string[] = [];
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const remaining = MAX_SEARCH_TEXT - processedText;
          if (remaining <= 0) { limited = true; break; }
          const chunk = item.str.slice(0, remaining);
          chunks.push(chunk);
          processedText += chunk.length;
          if (chunk.length < item.str.length) { limited = true; break; }
        }
        const text = chunks.join("");
        hasText ||= text.trim().length > 0;
        for (const match of findTextMatches(text, term, number, MAX_SEARCH_MATCHES - found.length)) found.push(match);
        if (found.length >= MAX_SEARCH_MATCHES || processedText >= MAX_SEARCH_TEXT) { limited = true; break; }
        // Yield so cancel/input stay responsive even for a fully cached document.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      if (run !== searchRun.current) return;
      setMatches(found);
      setActiveIndex(found.length ? 0 : -1);
      if (found.length) setPage(found[0].page);
      const scope = limited ? "en la parte procesada del PDF" : "en todo el PDF";
      const summary = found.length ? `${found.length} coincidencias ${scope}.` : hasText ? `Sin coincidencias ${scope}.` : limited ? "No se encontró texto extraíble en la parte procesada." : "Este PDF no contiene texto extraíble. No se realiza reconocimiento OCR de documentos escaneados.";
      setSearchStatus(`${summary}${limited ? " Búsqueda limitada a 1.000 coincidencias, 500 páginas o 2 millones de caracteres para cuidar la memoria. Los resultados pueden ser parciales." : ""}`);
    } catch {
      if (run === searchRun.current) setSearchStatus("No se pudo completar la búsqueda. Vuelve a buscar o reintenta cargar el documento.");
    } finally {
      if (run === searchRun.current) setSearching(false);
    }
  }
  function moveMatch(delta: number) {
    const index = Math.max(0, Math.min(matches.length - 1, activeIndex + delta));
    setActiveIndex(index);
    setPage(matches[index].page);
  }
  const failure = () => { setLoading(false); setLoadError(true); };

  return <ReaderFrame title={title} toolbar={<div className="flex items-center gap-1">
    <Button type="button" variant="ghost" className="size-11" aria-label="Página anterior" disabled={!pageCount || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" /></Button>
    <output aria-live="polite" className="min-w-24 text-center text-sm tabular-nums">Página {page} de {pageCount ?? "…"}</output>
    <Button type="button" variant="ghost" className="size-11" aria-label="Página siguiente" disabled={!pageCount || page >= pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" /></Button>
  </div>}>
    {(viewport) => <>
      <form onSubmit={search} role="search" aria-label="Buscar texto en todo el PDF" className="mb-4 space-y-2 rounded-lg border border-border bg-card p-3">
        <label htmlFor={`${id}-search`} className="block text-sm font-medium">Buscar dentro del PDF</label>
        <div className="flex flex-wrap gap-2">
          <input id={`${id}-search`} type="search" value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); cancelSearch(""); }} className="field min-w-24 flex-1" placeholder="Texto a buscar" disabled={!pageCount} />
          <Button type="submit" variant="outline" className="min-h-11 px-3" disabled={!pageCount || !query.trim() || searching}><Search aria-hidden="true" />Buscar</Button>
          {searching ? <Button type="button" variant="outline" className="min-h-11" onClick={() => cancelSearch()}><X aria-hidden="true" />Cancelar</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">Texto completo, sin distinguir mayúsculas. Los PDF escaneados pueden no contener texto.</p>
        <p role="status" aria-live="polite" aria-busy={searching} className="text-sm">{searchStatus}</p>
        {matches.length ? <div role="group" aria-label="Coincidencias" className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="size-11" aria-label="Coincidencia anterior" disabled={activeIndex <= 0} onClick={() => moveMatch(-1)}><ChevronLeft aria-hidden="true" /></Button>
          <output aria-live="polite" className="text-sm">{activeIndex + 1} de {matches.length} · página {matches[activeIndex].page}</output>
          <Button type="button" variant="outline" className="size-11" aria-label="Coincidencia siguiente" disabled={activeIndex >= matches.length - 1} onClick={() => moveMatch(1)}><ChevronRight aria-hidden="true" /></Button>
        </div> : null}
      </form>
      <div aria-busy={loading}>
        {loadError ? <ReaderFailure retry={retry} /> : <Document key={attempt} file={file.url} options={PDF_OPTIONS} suspense={false} loading={<p role="status" className="p-6">Cargando PDF…</p>} error={<ReaderFailure retry={retry} />} noData={<p role="status">No hay un archivo disponible.</p>} onSourceError={failure} onLoadError={failure} onPassword={failure} onLoadSuccess={documentLoaded}>
          {({ pdf }) => pdf.loadingTask.destroyed ? <p role="status">Cargando PDF…</p> : <SizedPdfSheet key={`${pdf.loadingTask.docId}:${page}:${viewport.width}:${viewport.zoom}`} pdf={pdf} retry={retry} page={page} {...viewport} matches={matches} active={matches[activeIndex]} />}
        </Document>}
      </div>
    </>}
  </ReaderFrame>;
}
