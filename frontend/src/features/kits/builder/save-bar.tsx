"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/feedback/alert";

export function SaveBar({
  dirty,
  isSaving,
  justSaved,
  error,
  onSave,
}: {
  dirty: boolean;
  isSaving: boolean;
  justSaved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-2">
      {error && <Alert tone="danger">{error} Your edits are still here — try saving again.</Alert>}
      <div className="flex items-center gap-3 rounded-(--radius-card) border-[1.5px] border-rule bg-paper px-5 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
        <span className="text-sm text-neutral">
          {isSaving ? "Saving…" : dirty ? "You have unsaved changes." : justSaved ? "All changes saved." : "No changes yet."}
        </span>
        <Button className="ml-auto" onClick={onSave} isLoading={isSaving} disabled={!dirty || isSaving}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
