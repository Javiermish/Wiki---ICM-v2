/** Fuente pública resuelta por servidor; no incluye rutas de disco ni claves privadas. */
export interface PublicMaterialFile {
  readonly kind: "pdf" | "image";
  readonly url: string;
  readonly downloadUrl: string;
  readonly downloadName: string;
  readonly mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  readonly extension: "pdf" | "png" | "jpg" | "webp";
  readonly bytes: number;
}

/** Sustituible por una implementación de Storage con autorización de servidor. */
export interface MaterialFileSource {
  resolve(materialId: string): Promise<PublicMaterialFile | null>;
}
