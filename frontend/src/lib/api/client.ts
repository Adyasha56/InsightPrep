import { ApiErrorResponse, ApiSuccessResponse } from "@/types/api";
import { ApiError } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

// The single place every backend call goes through: base URL, the httpOnly
// session cookie, JSON (de)serialisation, and error shaping are all handled
// here once — no component ever hand-rolls a fetch call (RULES.md-style
// centralisation, carried over from the backend's own conventions).
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the server. Check your connection and try again.", 0);
  }

  let body: ApiSuccessResponse<T> | ApiErrorResponse | undefined;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (e.g. an infrastructure error page) — fall through
    // to the generic status-based error below.
  }

  if (!response.ok || !body?.success) {
    const errorBody = body as ApiErrorResponse | undefined;
    throw new ApiError(
      errorBody?.error.code ?? "UNKNOWN_ERROR",
      errorBody?.error.message ?? `Request failed with status ${response.status}.`,
      response.status,
      errorBody?.error.details
    );
  }

  return body.data;
}
