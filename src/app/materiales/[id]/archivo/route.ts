import { readPublicMaterialFile } from "@/lib/materials/local-source";
import { materialFileResponse, resolveStoredMaterialFile, storedFileRedirect } from "@/lib/materials/stored-source";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    if (id.startsWith("demo-")) {
      const local = await readPublicMaterialFile(id);
      return local ? materialFileResponse(request, local) : new Response("Archivo no disponible.", { status: 404, headers });
    }
    const stored = await resolveStoredMaterialFile(id);
    return stored ? await storedFileRedirect(request, stored) : new Response("Archivo no disponible.", { status: 404, headers });
  } catch { return new Response("No se pudo leer el archivo. Reintenta más tarde.", { status: 503, headers }); }
}
