import { readStoredMaterialFile, materialFileResponse } from "@/lib/materials/stored-source";
import { materialHeaders } from "@/lib/materials/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await readStoredMaterialFile((await params).id, true);
    if (!resolved) return new Response("Archivo no disponible.", { status: 404, headers: materialHeaders });
    return materialFileResponse(request, resolved);
  } catch { return new Response("No se pudo leer el archivo. Reintenta más tarde.", { status: 503, headers: materialHeaders }); }
}
