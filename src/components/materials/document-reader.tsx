"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicMaterialFile } from "@/domain/material-file";
import { ReaderFrame } from "./reader-frame";
import { ReaderFailure } from "./reader-feedback";

const PdfReader = dynamic(() => import("./pdf-reader"), {
  ssr: false,
  loading: () => <p role="status" className="rounded-xl border border-border bg-card p-8">Preparando lector PDF…</p>,
});

export type DocumentReaderProps = { file: PublicMaterialFile; title: string };

class ReaderBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ReaderFailure retry={this.props.retry} /> : this.props.children; }
}

function ImageReader({ file, title }: DocumentReaderProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let active = true;
    const element = image.current;
    // SSR/cached images can finish (or fail) before React attaches load/error handlers.
    queueMicrotask(() => {
      if (active && element?.complete) setStatus(element.naturalWidth > 0 ? "ready" : "error");
    });
    return () => { active = false; };
  }, [attempt]);
  return <ReaderFrame title={title}>{({ width, zoom }) => <div aria-busy={status === "loading"}>
    {status === "loading" ? <p role="status" className="p-4">Cargando imagen…</p> : null}
    {status === "error" ? <ReaderFailure retry={() => { setStatus("loading"); setAttempt((value) => value + 1); }} /> : null}
    {/* Native image keeps the full original aspect ratio and never crops the page. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={image} key={attempt} src={file.url} alt={title} onLoad={() => setStatus("ready")} onError={() => setStatus("error")} className="mx-auto block max-w-none bg-white" style={{ width: width * zoom, height: "auto", display: status === "error" ? "none" : undefined }} />
  </div>}</ReaderFrame>;
}

export function DocumentReader({ file, title }: DocumentReaderProps) {
  const [attempt, setAttempt] = useState(0);
  return <ReaderBoundary key={`${file.url}:${attempt}`} retry={() => setAttempt((value) => value + 1)}>
    {file.kind === "pdf" ? <PdfReader file={file} title={title} /> : <ImageReader file={file} title={title} />}
  </ReaderBoundary>;
}
