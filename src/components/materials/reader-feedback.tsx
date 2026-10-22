"use client";

import { Button } from "@/components/ui/button";

export function ReaderFailure({ retry }: { retry: () => void }) {
  return <div role="alert" className="space-y-3 p-6"><p>No se pudo mostrar el archivo. Puede no estar disponible, estar dañado o protegido. Comprueba tu conexión y reintenta; también puedes probar el enlace de descarga de la ficha.</p><Button type="button" className="min-h-11" variant="outline" onClick={retry}>Reintentar</Button></div>;
}
