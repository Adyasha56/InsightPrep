import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { registerUser, loginUser, getUserById } from "../services/auth.service";
import { isProduction } from "../config/env";

const AUTH_COOKIE_NAME = "token";

// httpOnly keeps the token out of reach of XSS; logout only clears this
// cookie (no server-side session store), which is the accepted trade-off
// for a stateless JWT — see README for the alternative (token blocklist).
//
// sameSite must be "none" in production: frontend (Vercel) and backend
// (Render) are deployed on different registrable domains, which is
// genuinely cross-site — a "lax" cookie is never sent on a cross-site
// fetch()/XHR call (only on top-level navigation), so login would appear
// to succeed while every subsequent request arrives unauthenticated.
// "none" requires "secure", which is already tied to isProduction.
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
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
  // clearCookie must be called with matching attributes (path/sameSite/
  // secure) to reliably clear a cookie some browsers set stricter rules
  // around — omitting them works locally but is unreliable cross-site.
  res.clearCookie(AUTH_COOKIE_NAME, { httpOnly: true, secure: AUTH_COOKIE_OPTIONS.secure, sameSite: AUTH_COOKIE_OPTIONS.sameSite });
  sendSuccess(res, { loggedOut: true });
});

// Protected route example: requireAuth guarantees req.user is populated.
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await getUserById(req.user!.id);
  sendSuccess(res, { user });
});
