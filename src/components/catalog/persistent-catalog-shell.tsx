import type { ReactNode } from "react";
import { CourseCatalogProvider } from "./course-catalog-provider";
import { FavoritesFeedback, FavoritesProvider } from "./favorites-provider";
import { ModerationProvider } from "@/components/moderation/moderation-provider";
import { catalogUnavailable, getPublicCatalog } from "@/lib/catalog/persistent";
import type { PublicCatalog } from "@/domain/catalog";

export async function PersistentCatalogShell({ children }: { children: ReactNode }) {
  let catalog: PublicCatalog;
  let failed = false;
  try {
    catalog = await getPublicCatalog();
  } catch {
    // Keep account recovery available during catalog outages, with an explicit error.
    failed = true;
    catalog = { courses: [], electiveAreas: [], offerings: [], materials: [] };
  }
  return <CourseCatalogProvider initialCatalog={catalog}>
    <FavoritesProvider catalogAvailable={!failed}><ModerationProvider>
      {failed ? <aside role="alert" aria-label="Error del catálogo" className="page-container my-6 rounded-xl border border-destructive bg-card p-5"><h2 className="font-semibold">Catálogo temporalmente no disponible</h2><p className="mt-2 text-sm">{catalogUnavailable}</p><a href="" className="text-link mt-3 inline-flex min-h-11 items-center">Reintentar carga</a></aside> : null}
      <FavoritesFeedback />
      {children}
    </ModerationProvider></FavoritesProvider>
  </CourseCatalogProvider>;
}
