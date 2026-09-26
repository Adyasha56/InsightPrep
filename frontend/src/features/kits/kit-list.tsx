"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getKits } from "@/lib/api/kits";
import { KitListItem } from "@/types/kit";
import { ApiError } from "@/lib/api/errors";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants } from "@/components/ui/button-variants";
import { ROUTES } from "@/constants/routes";
import { KitRow } from "./kit-row";

type LoadState = "loading" | "loaded" | "error";

export function KitList() {
  const [kits, setKits] = useState<KitListItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Resetting to "loading" on every (re)fetch — including manual retries
    // via reloadKey — is intentional so the spinner reappears; there's no
    // React-idiomatic way to express "reset before an effect's async work"
    // that this lint rule accepts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");

    getKits()
      .then(({ kits }) => {
        if (cancelled) return;
        setKits(kits);
        setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your kits.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function retry() {
    setReloadKey((key) => key + 1);
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 border-t-[1.5px] border-dashed border-rule py-16 text-neutral">
        <Spinner className="h-4 w-4" />
        Loading your preparation space…
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="border-t-[1.5px] border-dashed border-rule py-8">
        <ErrorState message={error ?? "Something went wrong."} onRetry={retry} />
      </div>
    );
  }

  if (kits.length === 0) {
    return (
      <EmptyState
        title="No kits yet"
        description="Create your first kit from a job description and a company URL. InsightPrep will research the company and build a structured preparation plan from what it finds."
        action={
          <Link href={ROUTES.newKit} className={buttonVariants("primary")}>
            Create a new kit
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t-[1.5px] border-dashed border-rule pt-6">
      {kits.map((kit) => (
        <KitRow key={kit._id} kit={kit} />
      ))}
    </div>
  );
}
