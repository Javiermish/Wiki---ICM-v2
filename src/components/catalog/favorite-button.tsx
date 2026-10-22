"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { publicMaterialById } from "@/lib/catalog/query";
import { useCourseCatalog } from "./course-catalog-provider";
import { useFavorites } from "./favorites-provider";

export function FavoriteButton({ materialId, materialName }: { materialId: string; materialName: string }) {
  const { catalog } = useCourseCatalog();
  const { ids, toggle } = useFavorites();
  if (!publicMaterialById(catalog, materialId)) return null;
  const saved = ids.includes(materialId);
  const Icon = saved ? BookmarkCheck : Bookmark;

  return <button
    type="button"
    aria-pressed={saved}
    aria-label={`${saved ? "Quitar" : "Guardar"} ${materialName} en favoritos de demo`}
    className={buttonVariants({ variant: "outline", className: "min-h-11 gap-2 px-3" })}
    onClick={() => toggle(materialId)}
  >
    <Icon className="size-4" aria-hidden="true" />
    {saved ? "Quitar · demo" : "Guardar · demo"}
  </button>;
}
