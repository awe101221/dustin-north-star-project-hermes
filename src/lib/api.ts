/**
 * Browser-side helpers for calling Hermes route handlers. Every write in the
 * app goes through one of these so error handling and toasts stay uniform.
 */
export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { "content-type": "application/json", accept: "application/json", ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const body = text ? safeParse(text) : null;
  if (!res.ok) {
    const message = (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string")
      ? (body as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const queryKeys = {
  ideas: ["ideas"] as const,
  ideaEvents: (id: string) => ["idea-events", id] as const,
  notes: (scope?: string) => ["notes", scope ?? "all"] as const,
  trades: ["trades"] as const,
  mandate: ["mandate"] as const,
  agentTasks: ["agent-tasks"] as const,
  quantJobs: (kind?: string) => ["quant-jobs", kind ?? "all"] as const,
  activity: ["activity"] as const,
  search: (q: string) => ["search", q] as const,
  northStar: ["north-star-summary"] as const,
};
