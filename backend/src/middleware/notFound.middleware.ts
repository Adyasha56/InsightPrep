import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(ErrorCode.ROUTE_NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl}`, 404));
}
