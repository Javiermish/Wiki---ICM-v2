import { readPublicMaterialFile } from "@/lib/materials/local-source";
import { readStoredMaterialFile, materialFileResponse } from "@/lib/materials/stored-source";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let resolved;
  try { resolved = id.startsWith("demo-") ? await readPublicMaterialFile(id) : await readStoredMaterialFile(id); }
  catch { return new Response("No se pudo leer el archivo. Reintenta más tarde.", { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
  if (!resolved) return new Response("Archivo no disponible.", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return materialFileResponse(request, resolved);
}
