import { ErrorCode } from "../types/error-code.types";

// Base class for all expected/handled errors. Anything thrown that is not
// an AppError is treated as an unexpected internal failure by the error
// middleware and logged accordingly.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static notFound(message: string): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404);
  }

  static authRequired(message = "Authentication is required."): AppError {
    return new AppError(ErrorCode.AUTH_REQUIRED, message, 401);
  }

  static unauthorized(message = "You do not have access to this resource."): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED_ACCESS, message, 403);
  }
}
