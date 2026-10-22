"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useCourseCatalog } from "@/components/catalog/course-catalog-provider";
import type { PublicCatalog } from "@/domain/catalog";
import type { ModerationService, ModerationSnapshot } from "@/domain/moderation";
import { createDemoModerationSeed } from "@/fixtures/moderation";
import { createDemoModerationRepository } from "@/lib/moderation/repository";
import { toPublicCatalog } from "@/lib/catalog/public-catalog";

const ModerationContext = createContext<{ snapshot: ModerationSnapshot; service: ModerationService } | null>(null);

export function ModerationProvider({ children }: { children: ReactNode }) {
  const { catalog } = useCourseCatalog();
  const [source] = useState(() => {
    let current = toPublicCatalog(catalog);
    return { read: () => current, update: (next: PublicCatalog) => { current = next; } };
  });
  const [repository] = useState(() => createDemoModerationRepository(createDemoModerationSeed(source.read()), source.read));
  const [snapshot, setSnapshot] = useState(() => repository.getSnapshot());
  const mutate = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    // Reproyectar antes de cada operación: el repositorio del catálogo tipa Catalog.
    source.update(toPublicCatalog(catalog));
    const result = await operation();
    setSnapshot(repository.getSnapshot());
    return result;
  }, [repository, source, catalog]);
  const service = useMemo<ModerationService>(() => ({
    listMaterials: repository.listMaterials,
    listCourseRequests: repository.listCourseRequests,
    listReports: repository.listReports,
    listEvents: repository.listEvents,
    correctMaterialMetadata: (...args) => mutate(() => repository.correctMaterialMetadata(...args)),
    reviewMaterial: (...args) => mutate(() => repository.reviewMaterial(...args)),
    submitCourseRequest: (...args) => mutate(() => repository.submitCourseRequest(...args)),
    correctCourseRequest: (...args) => mutate(() => repository.correctCourseRequest(...args)),
    reviewCourseRequest: (...args) => mutate(() => repository.reviewCourseRequest(...args)),
    submitReport: (...args) => mutate(() => repository.submitReport(...args)),
    resolveReport: (...args) => mutate(() => repository.resolveReport(...args)),
  }), [repository, mutate]);
  const value = useMemo(() => ({ snapshot, service }), [snapshot, service]);
  return <ModerationContext.Provider value={value}>{children}</ModerationContext.Provider>;
}

export function useModeration() {
  const value = useContext(ModerationContext);
  if (!value) throw new Error("La demo requiere ModerationProvider.");
  return value;
}
