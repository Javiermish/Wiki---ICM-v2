"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PublicCatalog } from "@/domain/catalog";
import type { CourseInput } from "@/domain/course-management";
import { createCourseAction, updateCourseAction, setCourseArchivedAction } from "@/lib/catalog/actions";

function usePersistentCatalog(initialCatalog: PublicCatalog) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialCatalog);
  const [catalog, setCatalog] = useState(initialCatalog);
  if (snapshot !== initialCatalog) {
    setSnapshot(initialCatalog);
    setCatalog(initialCatalog);
  }
  const createCourse = useCallback(async (input: CourseInput) => {
    const course = await createCourseAction(input);
    setCatalog((current) => ({ ...current, courses: [...current.courses, course] }));
    router.refresh();
    return course;
  }, [router]);
  const updateCourse = useCallback(async (id: string, input: CourseInput, expectedVersion?: number) => {
    const course = await updateCourseAction(id, input, expectedVersion);
    setCatalog((current) => ({ ...current, courses: current.courses.map((item) => item.id === id ? course : item) }));
    router.refresh();
    return course;
  }, [router]);
  const setCourseArchived = useCallback(async (id: string, archived: boolean) => {
    const course = await setCourseArchivedAction(id, archived, catalog.courses.find((item) => item.id === id)?.version);
    setCatalog((current) => ({ ...current, courses: current.courses.map((item) => item.id === id ? course : item) }));
    router.refresh();
    return course;
  }, [catalog.courses, router]);
  return useMemo(() => ({ catalog, createCourse, updateCourse, setCourseArchived }), [catalog, createCourse, updateCourse, setCourseArchived]);
}

const CourseCatalogContext = createContext<ReturnType<typeof usePersistentCatalog> | null>(null);

export function CourseCatalogProvider({ initialCatalog, children }: { initialCatalog: PublicCatalog; children: ReactNode }) {
  const value = usePersistentCatalog(initialCatalog);
  return <CourseCatalogContext.Provider value={value}>{children}</CourseCatalogContext.Provider>;
}

export function useCourseCatalog() {
  const value = useContext(CourseCatalogContext);
  if (!value) throw new Error("El catálogo requiere CourseCatalogProvider.");
  return value;
}
