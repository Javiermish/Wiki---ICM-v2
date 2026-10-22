"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { FavoriteReference } from "@/domain/favorites";
import { sameFavorite } from "@/domain/favorites";
import { createLocalFavoritesStore } from "@/lib/favorites/local-store";
import { useCourseCatalog } from "./course-catalog-provider";

interface FavoritesContextValue {
  readonly references: readonly FavoriteReference[];
  readonly ready: boolean;
  readonly warning: string | null;
  readonly toggle: (reference: FavoriteReference) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/** Referencias locales, sin cuenta; siempre se resuelven contra el catálogo público. */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { catalog } = useCourseCatalog();
  const [store] = useState(() => createLocalFavoritesStore(() => window.localStorage));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => { store.hydrate(catalog); }, [store, catalog]);
  const toggle = useCallback((reference: FavoriteReference) => {
    const saved = store.getSnapshot().references.some(item => sameFavorite(item, reference));
    store.setSaved(reference, !saved, catalog);
  }, [store, catalog]);
  const value = useMemo(() => ({ ...snapshot, toggle }), [snapshot, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("Los favoritos de demo requieren FavoritesProvider.");
  return value;
}

export function FavoritesFeedback() {
  const { warning } = useFavorites();
  return <div role="status" aria-live="polite" className={warning ? "page-container my-4 rounded-xl border border-border bg-secondary p-4 text-sm text-secondary-foreground" : "sr-only"}>{warning}</div>;
}
