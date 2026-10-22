"use client";

import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTRIBUTION_FILE_ACCEPT, DEFAULT_CONTRIBUTION_MAX_BYTES } from "@/domain/contribution";

export function ContributionFilePicker({ file, error, onFiles, onRemove }: {
  file: File | null;
  error?: string;
  onFiles: (files: readonly File[]) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div>
    <div className={`rounded-xl border-2 border-dashed p-5 sm:p-6 ${dragging ? "border-primary bg-secondary" : "border-input bg-background"}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); onFiles(Array.from(event.dataTransfer.files)); }}>
      <Upload aria-hidden="true" className="mb-3 size-6 text-primary" />
      <label htmlFor="contribution-file" className="block font-semibold">{file ? "Reemplazar archivo" : "Seleccionar archivo"} <span className="text-sm font-normal">(obligatorio)</span></label>
      <p id="contribution-file-hint" className="mt-1 mb-4 text-sm text-muted-foreground">{`Arrastra un archivo aquí o usa el selector. PDF, JPEG, PNG o WebP, hasta ${DEFAULT_CONTRIBUTION_MAX_BYTES / (1024 * 1024)} MiB. Solo un archivo por simulación.`}</p>
      <input ref={input} id="contribution-file" name="file" form="contribution-form" type="file" accept={CONTRIBUTION_FILE_ACCEPT} aria-required="true" aria-invalid={Boolean(error)} aria-describedby={`contribution-file-hint${error ? " contribution-file-error" : ""}`} className="field max-w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium file:text-secondary-foreground"
        onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onFiles(files); event.target.value = ""; }} />
    </div>
    {file ? <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 basis-40"><p className="break-all text-sm font-medium">{file.name}</p><p className="text-sm text-muted-foreground">{(file.size / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 2 })} MiB · solo en esta página</p></div>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => { if (input.current) input.current.value = ""; onRemove(); input.current?.focus(); }}>Quitar archivo</Button>
    </div> : null}
    {error ? <p id="contribution-file-error" role="alert" className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}
  </div>;
}
