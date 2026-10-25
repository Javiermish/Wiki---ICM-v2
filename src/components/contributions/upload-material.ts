import type { ContributionDraft, ContributionReceipt } from "@/domain/contribution";

/** Transport progress is not confirmation of receipt; only a valid 201 is. */
export function uploadMaterial(draft: ContributionDraft, file: File, operationId: string, onProgress: (percent: number | null) => void): Promise<ContributionReceipt> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/materiales");
    request.timeout = 180000;
    request.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null);
    const failed = () => reject(new Error("No se pudo confirmar la recepción. Conservamos tu selección; reintenta sin editar para usar la misma operación."));
    request.onerror = failed;
    request.ontimeout = failed;
    request.onabort = failed;
    request.onload = () => {
      let response;
      try { response = JSON.parse(request.responseText); } catch { failed(); return; }
      if (request.status === 201 && typeof response?.id === "string" && response.status === "pending") resolve({ id: response.id, status: "pending" });
      else reject(new Error(typeof response?.error === "string" ? response.error : "No se pudo confirmar la recepción. Reintenta sin editar para conservar la misma operación."));
    };
    const body = new FormData();
    body.set("draft", JSON.stringify(draft));
    body.set("authorization", "true");
    body.set("operationId", operationId);
    body.set("file", file);
    request.send(body);
  });
}
