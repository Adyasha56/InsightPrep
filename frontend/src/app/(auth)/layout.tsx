"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/use-auth";
import { Container } from "@/components/ui/container";
import { ROUTES } from "@/constants/routes";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(ROUTES.dashboard);
    }
  }, [status, router]);

  if (status === "authenticated") {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col justify-center">
      <Container width="narrow" className="flex flex-col gap-10 py-16">
        <Link href={ROUTES.home} className="font-display text-lg text-ink">
          InsightPrep
        </Link>
        {children}
      </Container>
    </div>
  );
}
