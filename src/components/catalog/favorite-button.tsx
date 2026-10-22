"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useCourseCatalog } from "./course-catalog-provider";
import { useFavorites } from "./favorites-provider";
import { isPublicFavorite, sameFavorite, type FavoriteReference } from "@/domain/favorites";

type FavoriteButtonProps = { materialId: string; materialName: string; courseId?: never; courseName?: never }
  | { courseId: string; courseName: string; materialId?: never; materialName?: never };

export function FavoriteButton(props: FavoriteButtonProps) {
  const { catalog } = useCourseCatalog();
  const { references, ready, toggle } = useFavorites();
  const reference: FavoriteReference = props.materialId !== undefined ? { kind: "material", id: props.materialId } : { kind: "course", id: props.courseId };
  const name = props.materialName ?? props.courseName;
  if (!isPublicFavorite(catalog, reference)) return null;
  const saved = references.some(item => sameFavorite(item, reference));
  const Icon = saved ? BookmarkCheck : Bookmark;

  return <button
    type="button"
    aria-pressed={saved}
    aria-label={`${saved ? "Quitar" : "Guardar"} ${name} en favoritos de demo`}
    className={buttonVariants({ variant: "outline", className: "min-h-11 gap-2 px-3" })}
    disabled={!ready}
    onClick={() => toggle(reference)}
  >
    <Icon className="size-4" aria-hidden="true" />
    {saved ? "Quitar · demo" : "Guardar · demo"}
  </button>;
}
