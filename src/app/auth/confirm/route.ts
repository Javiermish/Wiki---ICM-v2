import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { confirmAuthCallback } from "@/lib/auth/flows";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const destination = isSupabaseConfigured() ? await confirmAuthCallback(await createClient(), params) : null;
  // Relative fixed paths preserve the cookie host (NextURL normalizes loopback to localhost).
  const response = new NextResponse(null, { status: 303, headers: { Location: destination ?? "/login?error=confirmation" } });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// Next otherwise derives HEAD from GET, consuming an OTP during link inspection.
export function HEAD() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
}
