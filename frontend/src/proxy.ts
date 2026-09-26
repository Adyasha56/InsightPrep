import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/kits"];

// Fast-path only: this checks whether the session cookie exists, not
// whether it's valid — the frontend has no access to JWT_SECRET, and
// shouldn't. Actual verification happens on every API call to the backend;
// AuthProvider (src/features/auth/auth-provider.tsx) redirects to /login
// when the cookie is present but expired/invalid. This proxy just avoids a
// flash of protected UI for the common case (no cookie at all).
export function proxy(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  if (!request.cookies.has("token")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/kits/:path*"],
};
