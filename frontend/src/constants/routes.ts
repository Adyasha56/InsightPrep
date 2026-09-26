// Centralised route paths so they're never hand-typed at call sites.
export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  newKit: "/kits/new",
  kit: (kitId: string) => `/kits/${kitId}`,
  practiceKit: (kitId: string) => `/kits/${kitId}/practice`,
} as const;
