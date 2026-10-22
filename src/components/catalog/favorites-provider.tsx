"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface FavoritesContextValue {
  readonly ids: readonly string[];
  readonly toggle: (id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/** Solo IDs de materiales en memoria del árbol cliente: sin cuenta ni persistencia.
 * No constituye autorización; las vistas resuelven siempre la proyección aprobada.
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<readonly string[]>([]);
  const toggle = useCallback((id: string) => {
    setIds((current) => current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id]);
  }, []);
  const value = useMemo(() => ({ ids, toggle }), [ids, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("Los favoritos de demo requieren FavoritesProvider.");
  return value;
}
