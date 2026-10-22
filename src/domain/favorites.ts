import type { Catalog } from "./catalog";
import { publicMaterialById } from "../lib/catalog/query.ts";

export interface FavoriteReference {
  readonly kind: "course" | "material";
  readonly id: string;
}

/** El servidor futuro impondrá el usuario desde Auth y RLS, nunca desde esta referencia. */
export interface FavoritesService {
  list(): Promise<readonly FavoriteReference[]>;
  setSaved(reference: FavoriteReference, saved: boolean): Promise<void>;
}

export function isPublicFavorite(catalog: Catalog, reference: FavoriteReference): boolean {
  if (reference.kind === "course") return catalog.courses.some(course => course.id === reference.id);
  return reference.kind === "material" && !!publicMaterialById(catalog, reference.id);
}

export function sameFavorite(left: FavoriteReference, right: FavoriteReference): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** localStorage es entrada no confiable; recuperar solo referencias públicas con esquema conocido. */
export function decodeFavorites(raw: string | null, catalog: Catalog): { references: FavoriteReference[]; recovered: boolean } {
  if (raw === null) return { references: [], recovered: false };
  const references: FavoriteReference[] = [];
  let recovered = false;
  try {
    if (raw.length > 100_000) throw new Error("Lista demasiado grande");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("items" in value) || !Array.isArray(value.items) || value.items.length > 1000) throw new Error("Esquema inválido");
    for (const item of value.items) {
      if (!item || typeof item !== "object" || (item.kind !== "course" && item.kind !== "material") || typeof item.id !== "string" || item.id.length > 200) {
        recovered = true;
        continue;
      }
      const reference: FavoriteReference = { kind: item.kind, id: item.id };
      if (!isPublicFavorite(catalog, reference) || references.some(saved => sameFavorite(saved, reference))) {
        recovered = true;
        continue;
      }
      if (Object.keys(item).some(key => key !== "kind" && key !== "id")) recovered = true;
      references.push(reference);
    }
    return { references, recovered };
  } catch {
    return { references: [], recovered: true };
  }
}
