import type { PublicMaterialFile } from "../../domain/material-file";

export const fileFormats = {
  pdf: { kind: "pdf", mimeType: "application/pdf" },
  png: { kind: "image", mimeType: "image/png" },
  jpg: { kind: "image", mimeType: "image/jpeg" },
  webp: { kind: "image", mimeType: "image/webp" },
} as const;

export function normalizedDownloadName(displayName: string, extension: PublicMaterialFile["extension"]): string {
  // Defensa de cabeceras/rutas: la entrada normal ya procede del dominio, nunca del nombre original.
  return `${displayName.replace(/[\x00-\x1f\x7f/\\"<>:|?*]/g, "").slice(0, 180)}.${extension}`;
}

/** Comprobación mínima de integridad de muestras locales; NO es validación segura de uploads. */
export function hasExpectedSignature(bytes: Uint8Array, extension: keyof typeof fileFormats): boolean {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  switch (extension) {
    case "pdf": return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "png": return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg": return starts([0xff, 0xd8, 0xff]);
    case "webp": return starts([0x52, 0x49, 0x46, 0x46]) && [0x57, 0x45, 0x42, 0x50].every((value, index) => bytes[index + 8] === value);
  }
}
