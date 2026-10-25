interface UploadReservation {
  id: string;
  storage_key: string;
  upload_state: "uploading" | "ready" | "failed";
  status: "pending" | "approved" | "rejected";
}

interface UploadDependencies {
  reserve(): Promise<UploadReservation>;
  put(key: string, data: Buffer, mimeType: string, sha256: string): Promise<void>;
  finalize(id: string): Promise<void>;
}

/** A timeout is ambiguous: never delete an object after a potentially committed finalization. */
export async function receiveMaterial(deps: UploadDependencies, file: { data: Buffer; mimeType: string; sha256: string }): Promise<{ id: string; status: "pending" }> {
  const reservation = await deps.reserve();
  if (reservation.status !== "pending") throw new Error("El aporte ya fue revisado. Consulta la decisión en Mis aportes.");
  if (reservation.upload_state === "failed") throw new Error("La reserva de subida expiró. Inicia un nuevo aporte.");
  if (reservation.upload_state !== "ready") {
    await deps.put(reservation.storage_key, file.data, file.mimeType, file.sha256);
    await deps.finalize(reservation.id);
  }
  return { id: reservation.id, status: "pending" };
}
