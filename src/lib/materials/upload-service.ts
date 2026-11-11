interface UploadReservation {
  id: string;
  storage_key: string;
  upload_state: "uploading" | "ready" | "failed";
  status: "pending" | "approved" | "rejected";
}

interface StoredUpload extends UploadReservation {
  sha256: string;
  bytes: number;
  mime_type: string;
}

type Receipt = { id: string; status: "pending" };
export type PreparedUpload = { kind: "received"; receipt: Receipt } | { kind: "upload"; id: string; uploadUrl: string };

/** Bytes were reviewed and refused: the reservation is already failed, so a retry needs a new contribution. */
export class UploadRejectedError extends Error {}

function assertOpen(reservation: UploadReservation) {
  if (reservation.status !== "pending") throw new Error("El aporte ya fue revisado. Consulta la decisión en Mis aportes.");
  if (reservation.upload_state === "failed") throw new Error("La reserva de subida expiró. Inicia un nuevo aporte.");
}

/** Phase 1: reserve, then hand the browser a short-lived signed PUT. A ready reservation is an idempotent retry. */
export async function prepareMaterialUpload(deps: {
  reserve(): Promise<UploadReservation>;
  sign(key: string): Promise<string>;
}): Promise<PreparedUpload> {
  const reservation = await deps.reserve();
  assertOpen(reservation);
  if (reservation.upload_state === "ready") return { kind: "received", receipt: { id: reservation.id, status: "pending" } };
  return { kind: "upload", id: reservation.id, uploadUrl: await deps.sign(reservation.storage_key) };
}

/**
 * Phase 2: the browser claims the PUT finished. Read the object back and validate the real bytes against the
 * reservation before finalizing. A timeout is ambiguous: never discard after a potentially committed finalization.
 */
export async function confirmMaterialUpload(reservation: StoredUpload, deps: {
  read(key: string): Promise<Buffer>;
  validate(data: Buffer): Promise<{ sha256: string; bytes: number; mimeType: string }>;
  discard(): Promise<void>;
  finalize(id: string): Promise<void>;
}): Promise<Receipt> {
  assertOpen(reservation);
  if (reservation.upload_state === "ready") return { id: reservation.id, status: "pending" };
  const data = await deps.read(reservation.storage_key);
  let validated;
  try { validated = await deps.validate(data); }
  catch (error) {
    await deps.discard();
    throw new UploadRejectedError(error instanceof Error ? error.message : "Archivo no válido.");
  }
  if (validated.sha256 !== reservation.sha256 || validated.bytes !== reservation.bytes || validated.mimeType !== reservation.mime_type) {
    await deps.discard();
    throw new UploadRejectedError("El archivo recibido no coincide con el seleccionado. Inicia un nuevo aporte.");
  }
  await deps.finalize(reservation.id);
  return { id: reservation.id, status: "pending" };
}
