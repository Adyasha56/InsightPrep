import { Response } from "express";
import { ApiErrorResponse, ApiSuccessResponse } from "../types/api-response.types";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): Response<ApiSuccessResponse<T>> {
  return res.status(statusCode).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}
