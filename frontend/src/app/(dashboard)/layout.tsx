"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { Masthead } from "@/components/layout/masthead";
import { Footer } from "@/components/layout/footer";
import { Spinner } from "@/components/ui/spinner";
import { ROUTES } from "@/constants/routes";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(ROUTES.login);
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-neutral">
        <Spinner className="h-4 w-4" />
        Loading…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Masthead />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
