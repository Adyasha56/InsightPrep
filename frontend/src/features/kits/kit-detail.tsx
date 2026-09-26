"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getKit, generateKit } from "@/lib/api/kits";
import { GenerationStatus, Kit } from "@/types/kit";
import { ApiError } from "@/lib/api/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Tag } from "@/components/ui/tag";
import { Divider } from "@/components/ui/divider";
import { Spinner } from "@/components/ui/spinner";
import { Counter } from "@/components/ui/counter";
import { Alert } from "@/components/feedback/alert";
import { ErrorState } from "@/components/feedback/error-state";
import { KitBuilder } from "./builder/kit-builder";
import { RoleSummary } from "./role-summary";
import { CoverageView } from "./coverage-view";
import { ScheduleView } from "./schedule-view";
import { TodaysFocus } from "./todays-focus";

type LoadState = "loading" | "loaded" | "error";

const STATUS_LABEL: Record<GenerationStatus, string> = {
  idle: "Not generated yet",
  researching: "Researching company…",
  generating: "Generating your kit…",
  completed: "Ready",
  failed: "Generation failed",
};

const STATUS_TONE: Record<GenerationStatus, "neutral" | "warning" | "success" | "danger"> = {
  idle: "neutral",
  researching: "warning",
  generating: "warning",
  completed: "success",
  failed: "danger",
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function KitDetail({ kitId }: { kitId: string }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Resetting to "loading" on every (re)fetch — including manual retries
    // via reloadKey — is intentional so the spinner reappears; there's no
    // React-idiomatic way to express "reset before an effect's async work"
    // that this lint rule accepts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");

    getKit(kitId)
      .then(({ kit }) => {
        if (cancelled) return;
        setKit(kit);
        setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load this kit.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [kitId, reloadKey]);

  function retry() {
    setReloadKey((key) => key + 1);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const { kit } = await generateKit(kitId);
      setKit(kit);
      // Star-burst micro-celebration (Hum signature move #7) — fires once
      // on this primary action's success, never auto-loops.
      setShowBurst(true);
      setTimeout(() => setShowBurst(false), 500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed. Please try again.");
      retry();
    } finally {
      setIsGenerating(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 py-16 text-neutral">
        <Spinner className="h-4 w-4" />
        Loading kit…
      </div>
    );
  }

  if (state === "error" || !kit) {
    return <ErrorState message={error ?? "This kit could not be found."} onRetry={retry} />;
  }

  const hostname = hostnameOf(kit.source.company_url);
  const canGenerate = kit.generationStatus === "idle" || kit.generationStatus === "failed";
  const isWorking = kit.generationStatus === "researching" || kit.generationStatus === "generating" || isGenerating;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tag tone={STATUS_TONE[kit.generationStatus]}>{STATUS_LABEL[kit.generationStatus]}</Tag>
          <span className="font-data text-xs text-muted">{kit.source.days_available} days to prepare</span>
        </div>
        <h1 className="text-3xl text-ink">{kit.role.title || hostname}</h1>
        <p className="text-neutral">{hostname}</p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {kit.generationStatus === "failed" && kit.generationError && (
        <Alert tone="danger">{kit.generationError.message}</Alert>
      )}

      {canGenerate && (
        <div className="relative self-start">
          <Button onClick={handleGenerate} isLoading={isGenerating}>
            {kit.generationStatus === "failed" ? "Try generating again" : "Generate kit"}
          </Button>
          {showBurst && <span className="star-burst" style={{ top: "-6px", right: "-6px" }} />}
        </div>
      )}

      {isWorking && !canGenerate && (
        <div className="flex items-center gap-2 text-neutral">
          <Spinner className="h-4 w-4" />
          This can take a minute — we&apos;re researching the company and writing your kit.
        </div>
      )}

      {kit.generationStatus === "completed" && (
        <>
          <TodaysFocus kit={kit} />

          <Divider />
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Requirements" value={kit.role.requirements.length} tint="bg-accent-bg" />
            <Stat label="Questions" value={kit.questions.length} tint="bg-cyan-bg" />
            <Stat label="Flashcards" value={kit.flashcards.length} tint="bg-mint-bg" />
            <Stat label="Study days" value={kit.schedule.days.length} tint="bg-lavender-bg" />
          </section>

          <Divider />
          <RoleSummary role={kit.role} />

          <Divider />
          <CoverageView role={kit.role} coverage={kit.coverage} />

          <Divider />
          <KitBuilder kit={kit} onSaved={setKit} />

          <Divider />
          <ScheduleView schedule={kit.schedule} questions={kit.questions} />

          <Divider />
          {kit.flashcards.length > 0 && (
            <Link href={ROUTES.practiceKit(kit._id)} className={buttonVariants("secondary", "self-start")}>
              Practice flashcards
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-(--radius-card) p-4 ${tint}`}>
      <span className="text-2xl font-semibold text-ink">
        <Counter value={value} />
      </span>
      <span className="text-sm text-neutral">{label}</span>
    </div>
  );
}
