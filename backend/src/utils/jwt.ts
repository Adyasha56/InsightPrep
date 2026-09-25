import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./AppError";
import { ErrorCode } from "../types/error-code.types";
import { AuthTokenPayload } from "../types/user.types";

export function signAuthToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.sub) {
      throw new Error("Token is missing a subject claim.");
    }
    return { id: decoded.sub };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, "Session has expired. Please log in again.", 401);
    }
    throw new AppError(ErrorCode.TOKEN_INVALID, "Invalid authentication token.", 401);
  }
}
