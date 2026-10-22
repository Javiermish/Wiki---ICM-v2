"use client";

import type { ReactNode, Ref } from "react";
import type { ElectiveArea } from "@/domain/catalog";
import { courseInputLimits, type CourseFieldErrors, type CourseInput } from "@/domain/course-management";

/** Misma entrada validada para gestión y corrección de solicitudes, sin duplicar formulario. */
export function CourseInputFields({ input, errors, areas, onChange, prefix = "course", nameRef }: {
  input: CourseInput; errors: CourseFieldErrors; areas: readonly ElectiveArea[];
  onChange: <K extends keyof CourseInput>(field: K, value: CourseInput[K]) => void;
  prefix?: string; nameRef?: Ref<HTMLInputElement>;
}) {
  function props(field: keyof CourseInput) {
    return { id: `${prefix}-${field}`, name: field, value: input[field], className: "field form-control", "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${prefix}-${field}-error` : undefined };
  }
  function field(name: keyof CourseInput, label: string, control: ReactNode, hint?: string) {
    return <div className="min-w-0">
      <label htmlFor={`${prefix}-${name}`} className="mb-2 block text-sm font-semibold">{label}</label>
      {hint ? <p className="mb-2 text-sm text-muted-foreground">{hint}</p> : null}
      {control}
      {errors[name] ? <p id={`${prefix}-${name}-error`} className="mt-2 text-sm font-medium text-destructive">{errors[name]}</p> : null}
    </div>;
  }
  return <div className="grid gap-6 sm:grid-cols-2">
    {field("name", "Nombre de la asignatura", <input {...props("name")} ref={nameRef} required maxLength={courseInputLimits.name} onChange={(event) => onChange("name", event.target.value)} />)}
    {field("code", "Código (opcional)", <input {...props("code")} maxLength={courseInputLimits.code} onChange={(event) => onChange("code", event.target.value)} />)}
    {field("kind", "Tipo de asignatura", <select {...props("kind")} required onChange={(event) => onChange("kind", event.target.value === "elective" ? "elective" : "regular")}><option value="regular">Regular</option><option value="elective">Electivo</option></select>)}
    {input.kind === "regular"
      ? field("curricularSemester", "Semestre curricular", <select {...props("curricularSemester")} required onChange={(event) => onChange("curricularSemester", event.target.value)}><option value="">Selecciona un semestre</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>Semestre {index + 1}</option>)}</select>, "Ubicación en la malla (1 a 12), no el período académico de los materiales.")
      : field("electiveAreaId", "Área del electivo", <select {...props("electiveAreaId")} required onChange={(event) => onChange("electiveAreaId", event.target.value)}><option value="">Selecciona un área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>, "Los electivos se organizan por área, sin semestre curricular.")}
    <div className="sm:col-span-2">{field("description", "Descripción (opcional)", <textarea {...props("description")} rows={4} maxLength={courseInputLimits.description} onChange={(event) => onChange("description", event.target.value)} />)}</div>
  </div>;
}
