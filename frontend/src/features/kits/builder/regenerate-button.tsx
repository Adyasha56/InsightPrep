"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/feedback/alert";
import { ApiError } from "@/lib/api/errors";

// Two-step confirm (same pattern as question/flashcard delete) rather than a
// modal — regeneration can discard unedited generated content, so it always
// asks first, but doesn't need a heavier interaction than a delete does.
export function RegenerateButton({
  label,
  confirmMessage,
  disabled,
  disabledReason,
  onRegenerate,
}: {
  label: string;
  confirmMessage: string;
  disabled?: boolean;
  disabledReason?: string;
  onRegenerate: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setConfirming(false);
    setIsLoading(true);
    setError(null);
    try {
      await onRegenerate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Regeneration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm text-neutral">{confirmMessage}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleConfirm}>
            Confirm regenerate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button
        variant="ghost"
        isLoading={isLoading}
        disabled={disabled || isLoading}
        title={disabled ? disabledReason : undefined}
        onClick={() => setConfirming(true)}
        className="self-start"
      >
        {label}
      </Button>
    </div>
  );
}
