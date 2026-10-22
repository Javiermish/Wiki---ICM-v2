"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentReader } from "@/components/materials/document-reader";

export type PreviewStatus = "loading" | "ready" | "error";

/** Object URLs exist only while this local preview is mounted and active. */
export function LocalFilePreview({ file, kind, title, onStatusChange }: {
  file: File;
  kind: "pdf" | "image";
  title: string;
  onStatusChange: (status: PreviewStatus) => void;
}) {
  const [resource, setResource] = useState<{ file: File; url: string } | null>(null);
  const activeUrl = useRef<string | null>(null);
  const reportStatus = useCallback((status: PreviewStatus) => {
    if (resource && activeUrl.current === resource.url) onStatusChange(status);
  }, [resource, onStatusChange]);

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    activeUrl.current = url;
    // The effect owns the URL, including when Next.js reactivates an Activity.
    queueMicrotask(() => {
      if (!active) return;
      onStatusChange("loading");
      setResource({ file, url });
    });
    return () => {
      active = false;
      if (activeUrl.current === url) activeUrl.current = null;
      URL.revokeObjectURL(url);
    };
  }, [file, onStatusChange]);

  if (!resource || resource.file !== file) return <p role="status" className="rounded-xl bg-muted p-4 text-sm">Preparando previsualización local…</p>;
  return <DocumentReader key={resource.url} file={{ kind, url: resource.url }} title={title} onStatusChange={reportStatus} />;
}
