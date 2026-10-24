export const requestPageSize = 50;
export type RequestStatusFilter = "all" | "pending" | "approved" | "rejected";

export function requestPagination(parameters: Record<string, string | string[] | undefined>, review = false) {
  const rawStatus = parameters.estado;
  const status: RequestStatusFilter = typeof rawStatus === "string" && ["all", "pending", "approved", "rejected"].includes(rawStatus)
    ? rawStatus as RequestStatusFilter : review ? "pending" : "all";
  const rawPage = parameters.pagina;
  const page = typeof rawPage === "string" && /^[1-9]\d{0,5}$/.test(rawPage) ? Number(rawPage) : 1;
  return { status, page, offset: (page - 1) * requestPageSize };
}
