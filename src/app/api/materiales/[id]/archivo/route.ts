import { resolveStoredMaterialFile, storedFileRedirect } from "@/lib/materials/stored-source";
import { materialHeaders } from "@/lib/materials/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveStoredMaterialFile((await params).id, true);
    if (!resolved) return new Response("Archivo no disponible.", { status: 404, headers: materialHeaders });
    return await storedFileRedirect(request, resolved);
  } catch { return new Response("No se pudo leer el archivo. Reintenta más tarde.", { status: 503, headers: materialHeaders }); }
}
