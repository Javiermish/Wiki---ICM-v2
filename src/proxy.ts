import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./lib/supabase/config";
import { getDemoCatalog } from "./lib/catalog/data";
import { publicMaterialById } from "./lib/catalog/query";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // The header is personalized even on public pages; never share cached HTML/RSC.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  const semester = request.nextUrl.pathname.match(/^\/semestres\/([^/]+)\/?$/)?.[1];
  const invalidSemester = semester !== undefined && !/^(?:[1-9]|1[0-2])$/.test(semester);
  const notFoundResponse = () => {
    const headers = new Headers(response.headers);
    headers.delete("x-middleware-next");
    // Resolve the status before Suspense can flush headers; keep refreshed cookies.
    return NextResponse.rewrite(new URL("/404", request.url), { status: 404, headers });
  };
  const materialId = request.nextUrl.pathname.match(/^\/materiales\/([^/]+)\/?$/)?.[1];
  // Demo absence must also be resolved before the layout can stream HTTP 200.
  if (materialId?.startsWith("demo-") && !publicMaterialById(getDemoCatalog(), materialId)) return notFoundResponse();
  // Neither a demo sample nor a UUID can ever exist, so this needs no Supabase configuration either.
  const malformedMaterialId = materialId !== undefined && !materialId.startsWith("demo-")
    && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(materialId);
  if (malformedMaterialId) return notFoundResponse();
  const config = getSupabaseConfig();
  if (!config) return invalidSemester ? notFoundResponse() : response;
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: config.url.startsWith("https:"), path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        response.headers.set("Cache-Control", "private, no-store, max-age=0");
      },
    },
  });
  await supabase.auth.getClaims();
  if (invalidSemester) return notFoundResponse();
  const slug = request.nextUrl.pathname.match(/^\/ramos\/([^/]+)\/?$/)?.[1];
  if (slug !== undefined) {
    let decodedSlug;
    try { decodedSlug = decodeURIComponent(slug); } catch { return notFoundResponse(); }
    const { data, error } = await supabase.from("courses").select("id")
      .eq("slug", decodedSlug).eq("status", "active").maybeSingle();
    // A failed lookup is not evidence of absence: let the page show its DB error.
    if (!error && !data) return notFoundResponse();
  }
  if (materialId !== undefined && !materialId.startsWith("demo-")) {
    const { data, error } = await supabase.from("public_materials").select("id").eq("id", materialId).maybeSingle();
    if (!error && !data) return notFoundResponse();
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|demo/|pdfjs/).*)"] };
