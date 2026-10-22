import type { Catalog } from "../../domain/catalog";
import { decodeFavorites, isPublicFavorite, sameFavorite, type FavoriteReference } from "../../domain/favorites.ts";

export const favoritesStorageKey = "wiki-icm:favorites:v1";
type FavoritesStorage = Pick<Storage, "getItem" | "setItem">;
interface FavoritesSnapshot {
  readonly references: readonly FavoriteReference[];
  readonly ready: boolean;
  readonly warning: string | null;
}
const initialSnapshot: FavoritesSnapshot = { references: [], ready: false, warning: null };

/** Una instancia por provider. Nunca lee/escribe almacenamiento durante SSR. */
export function createLocalFavoritesStore(getStorage: () => FavoritesStorage) {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  function update(next: FavoritesSnapshot) {
    snapshot = next;
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    hydrate(catalog: Catalog) {
      if (snapshot.ready) return;
      try {
        const result = decodeFavorites(getStorage().getItem(favoritesStorageKey), catalog);
        update({ references: result.references, ready: true, warning: result.recovered ? "Se recuperó la lista local omitiendo datos inválidos o recursos no disponibles." : null });
      } catch {
        update({ references: [], ready: true, warning: "No se pudo leer el almacenamiento del navegador. Puedes usar favoritos solo en memoria." });
      }
    },
    setSaved(reference: FavoriteReference, saved: boolean, catalog: Catalog) {
      if (!snapshot.ready) throw new Error("Los favoritos todavía se están cargando.");
      if (saved && !isPublicFavorite(catalog, reference)) throw new Error("Solo puedes guardar asignaturas y documentos públicos aprobados.");
      const existing = snapshot.references.some(item => sameFavorite(item, reference));
      const references = saved
        ? existing ? snapshot.references : [...snapshot.references, { kind: reference.kind, id: reference.id }]
        : snapshot.references.filter(item => !sameFavorite(item, reference));
      let warning: string | null = null;
      try {
        getStorage().setItem(favoritesStorageKey, JSON.stringify({ version: 1, items: references }));
      } catch {
        warning = "El cambio solo está en memoria: no se pudo guardar en este navegador. Puede perderse al recargar.";
      }
      update({ references, ready: true, warning });
    },
  };
}
