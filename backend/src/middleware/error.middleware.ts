import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { sendError } from "../utils/apiResponse";
import { isProduction } from "../config/env";

// Centralised error handler. Must be registered last, after all routes.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error(`[unhandled error] ${req.method} ${req.originalUrl}:`, err);

  sendError(
    res,
    500,
    ErrorCode.INTERNAL_ERROR,
    isProduction ? "An unexpected error occurred." : message
  );
}
