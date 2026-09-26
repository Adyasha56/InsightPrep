// Mirrors backend/src/types/api-response.types.ts exactly — every endpoint
// returns one of these two shapes.
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponseBody<T> = ApiSuccessResponse<T> | ApiErrorResponse;
