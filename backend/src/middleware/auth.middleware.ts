import { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";

const AUTH_COOKIE_NAME = "token";

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return req.cookies?.[AUTH_COOKIE_NAME];
}

// Verifies the JWT from either the httpOnly session cookie or an
// Authorization header and attaches the decoded identity to req.user.
// Stateless by design: no database lookup on every request.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    next(AppError.authRequired());
    return;
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch (error) {
    next(error);
  }
}
