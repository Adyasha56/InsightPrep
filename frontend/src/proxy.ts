import { NextResponse } from "next/server";

// This was a fast-path optimization: redirect away from protected routes
// early if the session cookie is obviously absent, before any protected UI
// renders. It only works when the frontend and backend share a hostname
// (as they do in local dev, both on "localhost" — cookies aren't
// port-scoped). Once frontend and backend are deployed on different
// domains (e.g. a vercel.app frontend + an onrender.com backend), the
// backend's cookie is never sent to the frontend's domain at all — this
// middleware would then see "no cookie" on every request and redirect
// every logged-in user away from /dashboard and /kits, permanently.
//
// The real auth check already happens client-side: AuthProvider
// (src/features/auth/auth-provider.tsx) calls GET /api/auth/me with
// credentials included, which correctly reaches the backend cross-site,
// and the (dashboard) layout redirects to /login itself if that fails.
// So this middleware is now a no-op rather than a cookie-presence gate —
// removing it entirely would also work, but keeping the file (and the
// matcher) makes it a one-line change back on if frontend/backend are ever
// moved under the same parent domain, where the fast-path would work again.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/kits/:path*"],
};
