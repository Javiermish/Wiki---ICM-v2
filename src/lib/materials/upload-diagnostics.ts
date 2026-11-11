type UploadStage = "configuration" | "supabase_budget" | "catalog" | "supabase_reserve" | "r2_sign" | "supabase_load" | "r2_read" | "discard" | "supabase_finalize";

/** Temporary opt-in diagnostics: never serialize errors, messages, identifiers or payloads. */
export function logMaterialUploadFailure(stage: UploadStage, error: unknown): void {
  if (process.env.WIKI_MATERIAL_UPLOAD_DIAGNOSTICS !== "true") return;
  // Bound cause traversal even if a dependency returns a cyclic error.
  for (let depth = 0; depth < 4 && error && typeof error === "object" && "cause" in error && error.cause; depth++) error = error.cause;
  const value = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; message?: unknown; $metadata?: { httpStatusCode?: unknown } } : {};
  const code = typeof value.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(value.code)
    ? value.code
    : ["AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "NoSuchBucket", "RequestTimeout", "TimeoutError", "NetworkingError", "CredentialsProviderError", "PreconditionFailed", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].find(code => code === value.name || code === value.code) ?? "UNKNOWN";
  const status = value.$metadata?.httpStatusCode;
  const reasons: Record<string, string> = {
    "Invalid upload metadata": "invalid_upload_metadata", "Verified account required": "verified_account_required",
    "Upload quota exceeded": "upload_quota_exceeded", "Active course required": "active_course_required",
    "Operation payload conflict": "operation_payload_conflict", "Upload not found": "upload_not_found",
    "Upload failed or expired": "upload_failed_or_expired", "Invalid metadata text": "invalid_metadata_text",
    "Invalid academic period or number": "invalid_academic_period_or_number", "Document number required or invalid": "invalid_document_number",
  };
  const reason = typeof value.message === "string" && Object.hasOwn(reasons, value.message) ? reasons[value.message] : undefined;
  console.error("[material-upload]", { stage, code, ...(reason ? { reason } : {}), ...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}) });
}
