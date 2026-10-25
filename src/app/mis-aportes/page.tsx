import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireAccount } from "@/lib/auth/session";
import { Suspense } from "react";
import { getOwnMaterials } from "@/lib/materials/persistent";
import { PersistentMaterialList } from "@/components/moderation/persistent-materials";
import type { SearchParameters } from "@/lib/catalog/filters";
import { requestPagination } from "@/lib/catalog/request-pagination";

export const metadata: Metadata = { title: "Mis aportes · Wiki ICM", robots: { index: false, follow: false } };

export default function ContributionsPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Verificando acceso…</p></main>}><ContributionsContent searchParams={searchParams} /></Suspense>;
}

async function ContributionsContent({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await requireAccount("/mis-aportes");
  const { page } = requestPagination(await searchParams);
  let materials;
  try { materials = await getOwnMaterials(page); } catch { materials = null; }
  return <AuthShell title="Mis aportes" description="Consulta tus envíos reales y las notas de revisión. Los materiales pendientes o rechazados no son públicos.">
    <Link href="/aportar" className="mb-6 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Aportar un material</Link>
    {materials ? <PersistentMaterialList materials={materials} page={page} /> : <p role="alert" className="rounded-xl border border-destructive p-5 text-sm text-destructive">No se pudieron cargar tus aportes. Comprueba la configuración y tu sesión; recarga para reintentar. No se muestran datos ficticios.</p>}
  </AuthShell>;
}
