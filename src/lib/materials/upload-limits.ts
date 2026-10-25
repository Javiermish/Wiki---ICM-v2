let active = 0;

// SQL enforces per-account attempts across instances; this bounds each process's memory.
export async function withUploadSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) throw new Error("El servidor de aportes está ocupado. Reintenta en unos minutos.");
  active += 1;
  try { return await work(); }
  finally { active -= 1; }
}
