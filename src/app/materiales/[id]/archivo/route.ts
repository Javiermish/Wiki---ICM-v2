import { readPublicMaterialFile } from "@/lib/materials/local-source";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await readPublicMaterialFile(id);
  if (!resolved) return new Response("Archivo no disponible.", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { file, data } = resolved;
  const disposition = new URL(request.url).searchParams.get("descargar") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(data), { headers: {
    "Content-Type": file.mimeType,
    "Content-Length": String(data.length),
    "Content-Disposition": `${disposition}; filename="${file.downloadName}"; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
