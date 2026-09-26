"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";

const NAV_LINKS = [{ href: ROUTES.dashboard, label: "Dashboard" }];

// N1b SaaS three-section, Hum-toned: wordmark (+ the one character moment —
// a small pear-yellow mark that pulses at rest), primary links, account area.
export function Masthead() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.push(ROUTES.home);
  }

  return (
    <header className="border-b-[1.5px] border-dashed border-rule">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <Link
          href={status === "authenticated" ? ROUTES.dashboard : ROUTES.home}
          className="flex shrink-0 items-center gap-2 font-display text-base font-semibold whitespace-nowrap text-ink sm:text-lg"
        >
          <span className="character-mark shrink-0" aria-hidden="true" />
          InsightPrep
        </Link>

        <nav className="flex items-center gap-3 sm:gap-6">
          {status === "authenticated" &&
            NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "hidden text-sm font-medium whitespace-nowrap text-neutral transition-colors hover:text-ink sm:inline",
                  pathname === link.href && "text-ink"
                )}
              >
                {link.label}
              </Link>
            ))}

          {status === "loading" && <span className="text-sm text-muted">…</span>}

          {status === "unauthenticated" && (
            <>
              <Link href={ROUTES.login} className="text-sm font-medium whitespace-nowrap text-neutral hover:text-ink">
                Log in
              </Link>
              <Link href={ROUTES.register} className={buttonVariants("primary", "btn--sm whitespace-nowrap")}>
                Create account
              </Link>
            </>
          )}

          {status === "authenticated" && (
            <div className="flex items-center gap-3 border-l-[1.5px] border-dashed border-rule pl-3 sm:gap-4 sm:pl-6">
              <span className="hidden text-sm text-neutral md:inline">{user?.email}</span>
              <button onClick={handleLogout} className="text-sm font-medium whitespace-nowrap text-neutral hover:text-coral">
                Log out
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
