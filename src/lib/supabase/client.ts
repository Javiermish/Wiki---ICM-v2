"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("La autenticación aún no está configurada.");
  return createBrowserClient(config.url, config.key);
}
