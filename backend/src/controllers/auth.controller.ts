import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { registerUser, loginUser, getUserById } from "../services/auth.service";
import { isProduction } from "../config/env";

const AUTH_COOKIE_NAME = "token";

// httpOnly keeps the token out of reach of XSS; logout only clears this
// cookie (no server-side session store), which is the accepted trade-off
// for a stateless JWT — see README for the alternative (token blocklist).
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, token } = await registerUser(req.body);
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  sendSuccess(res, { user }, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, token } = await loginUser(req.body);
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  sendSuccess(res, { user });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  sendSuccess(res, { loggedOut: true });
});

// Protected route example: requireAuth guarantees req.user is populated.
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await getUserById(req.user!.id);
  sendSuccess(res, { user });
});
