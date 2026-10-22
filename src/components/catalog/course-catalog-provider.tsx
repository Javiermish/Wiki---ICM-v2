"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PublicCatalog } from "@/domain/catalog";
import type { CourseInput } from "@/domain/course-management";
import { createDemoCourseRepository } from "@/lib/catalog/repository";

function useDemoCatalog(initialCatalog: PublicCatalog) {
  // Una instancia por árbol/pestaña; nunca un singleton mutable en SSR.
  const [repository] = useState(() => createDemoCourseRepository(initialCatalog));
  const [catalog, setCatalog] = useState(() => repository.getCatalog());
  const createCourse = useCallback(async (input: CourseInput) => {
    const course = repository.createCourse(input);
    setCatalog(repository.getCatalog());
    return course;
  }, [repository]);
  const updateCourse = useCallback(async (id: string, input: CourseInput) => {
    const course = repository.updateCourse(id, input);
    setCatalog(repository.getCatalog());
    return course;
  }, [repository]);
  const setCourseArchived = useCallback(async (id: string, archived: boolean) => {
    const course = repository.setCourseArchived(id, archived);
    setCatalog(repository.getCatalog());
    return course;
  }, [repository]);
  return useMemo(() => ({ catalog, createCourse, updateCourse, setCourseArchived }), [catalog, createCourse, updateCourse, setCourseArchived]);
}

const CourseCatalogContext = createContext<ReturnType<typeof useDemoCatalog> | null>(null);

export function CourseCatalogProvider({ initialCatalog, children }: { initialCatalog: PublicCatalog; children: ReactNode }) {
  const value = useDemoCatalog(initialCatalog);
  return <CourseCatalogContext.Provider value={value}>{children}</CourseCatalogContext.Provider>;
}

export function useCourseCatalog() {
  const value = useContext(CourseCatalogContext);
  if (!value) throw new Error("El catálogo requiere CourseCatalogProvider.");
  return value;
}
