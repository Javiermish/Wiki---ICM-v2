import "server-only";
import { open, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import type { MaterialFileSource, PublicMaterialFile } from "@/domain/material-file";
import { demoCatalog } from "@/fixtures/catalog";
import { demoMaterialFiles } from "@/fixtures/material-files";
import { publicMaterialById } from "@/lib/catalog/query";
import { fileFormats, hasExpectedSignature, normalizedDownloadName } from "./file-metadata";

/** Cada lectura comprueba aprobación ANTES de acceder al manifiesto o al disco. */
export async function readPublicMaterialFile(id: string): Promise<{ file: PublicMaterialFile; data: Buffer } | null> {
  const material = publicMaterialById(demoCatalog, id);
  if (!material || !Object.hasOwn(demoMaterialFiles, id)) return null;
  const entry = demoMaterialFiles[id as keyof typeof demoMaterialFiles];
  try {
    // Ruta fija de allowlist, nunca construida desde el ID/nombre aportado por el usuario.
    const root = await realpath(join(process.cwd(), "public", "demo"));
    const path = await realpath(join(root, entry.filename));
    if (!path.startsWith(`${root}${sep}`)) return null;
    const handle = await open(path, "r");
    let data: Buffer;
    try {
      const info = await handle.stat();
      if (!info.isFile() || !info.size || info.size > 20 * 1024 * 1024) return null;
      // Lectura acotada incluso si el archivo crece después de stat().
      data = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < data.length) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
        if (!bytesRead) return null;
        offset += bytesRead;
      }
    } finally { await handle.close(); }
    if (!hasExpectedSignature(data, entry.extension)) return null;
    const url = `/materiales/${encodeURIComponent(id)}/archivo`;
    return { data, file: {
      ...fileFormats[entry.extension], extension: entry.extension, bytes: data.length,
      url, downloadUrl: `${url}?descargar=1`, downloadName: normalizedDownloadName(material.displayName, entry.extension),
    } };
  } catch {
    // Archivo ausente/no legible: no filtrar rutas de disco ni errores internos.
    return null;
  }
}

export const materialFileSource: MaterialFileSource = {
  async resolve(id) { return (await readPublicMaterialFile(id))?.file ?? null; },
};
