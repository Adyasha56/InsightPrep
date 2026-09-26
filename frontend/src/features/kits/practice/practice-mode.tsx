"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getKit, recordFlashcardPractice } from "@/lib/api/kits";
import { Flashcard, FlashcardConfidence, Kit } from "@/types/kit";
import { ApiError } from "@/lib/api/errors";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/feedback/alert";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { sortByPracticePriority } from "./priority";

type LoadState = "loading" | "loaded" | "error";

const CONFIDENCE_OPTIONS: { value: NonNullable<FlashcardConfidence>; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function tierCounts(flashcards: Flashcard[]) {
  return {
    uncovered: flashcards.filter((f) => f.confidence === null).length,
    low: flashcards.filter((f) => f.confidence === "low").length,
    medium: flashcards.filter((f) => f.confidence === "medium").length,
    high: flashcards.filter((f) => f.confidence === "high").length,
  };
}

export function PracticeMode({ kitId }: { kitId: string }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getKit(kitId)
      .then(({ kit }) => {
        if (cancelled) return;
        setKit(kit);
        setQueue(sortByPracticePriority(kit.flashcards));
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
  }, [kitId]);

  function startNewSession() {
    if (!kit) return;
    setQueue(sortByPracticePriority(kit.flashcards));
    setIndex(0);
    setRevealed(false);
    setRecordError(null);
  }

  async function handleRecord(confidence: NonNullable<FlashcardConfidence>) {
    const current = queue[index];
    setIsRecording(true);
    setRecordError(null);
    try {
      const { kit: updated } = await recordFlashcardPractice(kitId, current.id, { confidence });
      setKit(updated);
      // Only the current card's confidence changed; keep everyone else's
      // position in the already-fixed session order exactly as it was.
      setQueue((prev) => prev.map((f) => (f.id === current.id ? { ...f, confidence } : f)));
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (err) {
      setRecordError(err instanceof ApiError ? err.message : "Could not record your answer. Please try again.");
    } finally {
      setIsRecording(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 py-16 text-neutral">
        <Spinner className="h-4 w-4" />
        Loading flashcards…
      </div>
    );
  }

  if (state === "error" || !kit) {
    return <ErrorState message={error ?? "This kit could not be found."} />;
  }

  if (kit.generationStatus !== "completed") {
    return (
      <EmptyState
        title="This kit isn't ready yet"
        description="Generate the kit before practicing its flashcards."
        action={
          <Link href={ROUTES.kit(kitId)} className="text-sm font-medium text-ink underline underline-offset-2 hover:text-cyan">
            Back to kit
          </Link>
        }
      />
    );
  }

  if (kit.flashcards.length === 0) {
    return (
      <EmptyState
        title="No flashcards to practice"
        description="Add some flashcards in the kit builder first."
        action={
          <Link href={ROUTES.kit(kitId)} className="text-sm font-medium text-ink underline underline-offset-2 hover:text-cyan">
            Back to kit
          </Link>
        }
      />
    );
  }

  const counts = tierCounts(kit.flashcards);
  const current = queue[index];
  const isDone = index >= queue.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={ROUTES.kit(kitId)} className="text-sm text-neutral underline underline-offset-2 hover:text-cyan">
          ← Back to kit
        </Link>
        <div className="flex flex-wrap items-center gap-2 font-data text-xs text-muted">
          <span>Uncovered: {counts.uncovered}</span>
          <span>· Low: {counts.low}</span>
          <span>· Medium: {counts.medium}</span>
          <span>· High: {counts.high}</span>
        </div>
      </div>

      {isDone ? (
        <div className="flex flex-col items-start gap-4 py-12">
          <p className="font-display text-lg text-ink">You&apos;ve reviewed all {queue.length} cards.</p>
          <p className="text-neutral">Practice again to focus on whatever&apos;s still low or medium confidence.</p>
          <Button onClick={startNewSession}>Practice again</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <span className="font-data text-xs text-muted">
            Card {index + 1} of {queue.length}
          </span>

          {recordError && <Alert tone="danger">{recordError}</Alert>}

          <div className="flex min-h-48 flex-col justify-center gap-4 rounded-(--radius-card) border-[1.5px] border-rule bg-paper p-8">
            <div className="flex items-center gap-2">
              {current.origin === "user" ? (
                <Tag tone="lavender">Your card</Tag>
              ) : current.edited ? (
                <Tag tone="cyan">Edited</Tag>
              ) : (
                <Tag tone="neutral">Generated</Tag>
              )}
            </div>
            <p className="text-xl text-ink">{current.front}</p>

            {revealed && (
              <>
                <div className="border-t-[1.5px] border-dashed border-rule pt-4">
                  <p className="text-neutral">{current.back}</p>
                </div>
              </>
            )}
          </div>

          {!revealed ? (
            <Button className="self-start" onClick={() => setRevealed(true)}>
              Reveal Answer
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral">How confident were you?</span>
              {CONFIDENCE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant="secondary"
                  isLoading={isRecording}
                  disabled={isRecording}
                  onClick={() => handleRecord(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
