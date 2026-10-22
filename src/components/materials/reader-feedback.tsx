"use client";

import { Button } from "@/components/ui/button";

export function ReaderFailure({ retry }: { retry: () => void }) {
  return <div role="alert" className="space-y-3 p-6"><p>No se pudo mostrar el archivo. Puede estar dañado, protegido o no disponible. Reintenta; si es un archivo local, prueba con otro PDF o imagen.</p><Button type="button" className="min-h-11" variant="outline" onClick={retry}>Reintentar</Button></div>;
}
