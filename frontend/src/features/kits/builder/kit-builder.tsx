"use client";

import { useEffect, useState } from "react";
import { updateKit, regenerateKit } from "@/lib/api/kits";
import { ApiError } from "@/lib/api/errors";
import { Divider } from "@/components/ui/divider";
import { Alert } from "@/components/feedback/alert";
import {
  Flashcard,
  Kit,
  Question,
  QuestionCategory,
  QuestionDifficulty,
  UpdateFlashcardInput,
  UpdateQuestionInput,
} from "@/types/kit";
import { CompanyBriefEditor } from "./company-brief-editor";
import { QuestionCategorySection } from "./question-category-section";
import { FlashcardEditor } from "./flashcard-editor";
import { RegenerateButton } from "./regenerate-button";
import { SaveBar } from "./save-bar";

const CATEGORIES: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];

function tempId(): string {
  return `temp-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

function isTempId(id: string): boolean {
  return id.startsWith("temp-");
}

// Builds the local editable copy fresh from whatever the server considers
// canonical — called on first load and again after every successful save, so
// local state never drifts from the server-computed origin/edited/coverage.
function fromKit(kit: Kit) {
  return {
    companyBrief: { summary: kit.company_brief.summary, what_they_do: kit.company_brief.what_they_do, edited: kit.company_brief.edited },
    questions: kit.questions.map((q) => ({ ...q })),
    flashcards: kit.flashcards.map((f) => ({ ...f })),
  };
}

export function KitBuilder({ kit, onSaved }: { kit: Kit; onSaved: (kit: Kit) => void }) {
  const [state, setState] = useState(() => fromKit(kit));
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The kit prop changes identity after a successful save (parent replaces it
  // with the server's response) — resync local state from it rather than
  // letting the two copies diverge.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(fromKit(kit));
  }, [kit]);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function markDirty() {
    setDirty(true);
    setJustSaved(false);
  }

  function updateCompanyBrief(patch: Partial<{ summary: string; what_they_do: string }>) {
    setState((prev) => ({ ...prev, companyBrief: { ...prev.companyBrief, ...patch } }));
    markDirty();
  }

  function updateQuestion(id: string, patch: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty" | "category">>) {
    setState((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));
    markDirty();
  }

  function moveQuestion(id: string, direction: "up" | "down") {
    setState((prev) => {
      const target = prev.questions.find((q) => q.id === id);
      if (!target) return prev;
      const sameCategoryIndices = prev.questions
        .map((q, index) => ({ q, index }))
        .filter(({ q }) => q.category === target.category)
        .map(({ index }) => index);
      const position = sameCategoryIndices.indexOf(prev.questions.indexOf(target));
      const swapWith = direction === "up" ? position - 1 : position + 1;
      if (swapWith < 0 || swapWith >= sameCategoryIndices.length) return prev;

      const questions = [...prev.questions];
      const a = sameCategoryIndices[position];
      const b = sameCategoryIndices[swapWith];
      [questions[a], questions[b]] = [questions[b], questions[a]];
      return { ...prev, questions };
    });
    markDirty();
  }

  function deleteQuestion(id: string) {
    setState((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.id !== id) }));
    markDirty();
  }

  function addQuestion(category: QuestionCategory, input: { prompt: string; answer_outline: string; difficulty: QuestionDifficulty }) {
    const newQuestion: Question = {
      id: tempId(),
      prompt: input.prompt,
      answer_outline: input.answer_outline,
      difficulty: input.difficulty,
      category,
      requirement_ids: [],
      origin: "user",
      edited: false,
    };
    setState((prev) => ({ ...prev, questions: [...prev.questions, newQuestion] }));
    markDirty();
  }

  function updateFlashcard(id: string, patch: Partial<Pick<Flashcard, "front" | "back">>) {
    setState((prev) => ({
      ...prev,
      flashcards: prev.flashcards.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
    markDirty();
  }

  function deleteFlashcard(id: string) {
    setState((prev) => ({ ...prev, flashcards: prev.flashcards.filter((f) => f.id !== id) }));
    markDirty();
  }

  function addFlashcard(input: { front: string; back: string }) {
    const newFlashcard: Flashcard = {
      id: tempId(),
      front: input.front,
      back: input.back,
      requirement_ids: [],
      origin: "user",
      edited: false,
      confidence: null,
    };
    setState((prev) => ({ ...prev, flashcards: [...prev.flashcards, newFlashcard] }));
    markDirty();
  }

  // Regeneration acts on the server's last-saved kit, not local draft state
  // — proceeding while dirty would silently discard unsaved edits the
  // moment the response replaces local state. Simplest safe rule: block it.
  const regenerateDisabled = dirty;
  const regenerateDisabledReason = dirty ? "Save or discard your changes first." : undefined;

  async function handleRegenerateCompanyBrief() {
    const { kit: updated } = await regenerateKit(kit._id, { target: "company_brief" });
    onSaved(updated);
  }

  async function handleRegenerateCategory(category: QuestionCategory) {
    const { kit: updated } = await regenerateKit(kit._id, { target: "category", category });
    onSaved(updated);
  }

  async function handleRegenerateSchedule() {
    const { kit: updated } = await regenerateKit(kit._id, { target: "schedule" });
    onSaved(updated);
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);

    const questions: UpdateQuestionInput[] = state.questions.map((q) => ({
      id: isTempId(q.id) ? undefined : q.id,
      prompt: q.prompt,
      answer_outline: q.answer_outline,
      difficulty: q.difficulty,
      category: q.category,
    }));
    const flashcards: UpdateFlashcardInput[] = state.flashcards.map((f) => ({
      id: isTempId(f.id) ? undefined : f.id,
      front: f.front,
      back: f.back,
    }));

    try {
      const { kit: updated } = await updateKit(kit._id, {
        company_brief: state.companyBrief,
        questions,
        flashcards,
      });
      onSaved(updated);
      setDirty(false);
      setJustSaved(true);
    } catch (err) {
      // Local edits are left exactly as they were — never lose them on a
      // failed save.
      setSaveError(err instanceof ApiError ? err.message : "Could not save your changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-10 pb-24">
      <CompanyBriefEditor
        brief={state.companyBrief}
        onChange={updateCompanyBrief}
        onRegenerate={handleRegenerateCompanyBrief}
        regenerateDisabled={regenerateDisabled}
        regenerateDisabledReason={regenerateDisabledReason}
      />

      <Divider />

      <div className="flex flex-col gap-8" data-testid="questions-section">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Questions</h2>
        {CATEGORIES.map((category) => (
          <QuestionCategorySection
            key={category}
            category={category}
            questions={state.questions.filter((q) => q.category === category)}
            onChangeQuestion={updateQuestion}
            onMoveQuestion={moveQuestion}
            onDeleteQuestion={deleteQuestion}
            onAddQuestion={addQuestion}
            onRegenerateCategory={handleRegenerateCategory}
            regenerateDisabled={regenerateDisabled}
            regenerateDisabledReason={regenerateDisabledReason}
          />
        ))}
      </div>

      <Divider />

      <FlashcardEditor
        flashcards={state.flashcards}
        onChangeFlashcard={updateFlashcard}
        onDeleteFlashcard={deleteFlashcard}
        onAddFlashcard={addFlashcard}
      />

      <Divider />

      <section className="flex flex-col gap-3" data-testid="schedule-section">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Schedule</h2>
        <p className="text-sm text-neutral">Recompute day-by-day placement from the current question set.</p>
        <RegenerateButton
          label="Regenerate schedule"
          confirmMessage="This recomputes day placement and timing from your current questions."
          disabled={regenerateDisabled}
          disabledReason={regenerateDisabledReason}
          onRegenerate={handleRegenerateSchedule}
        />
      </section>

      {state.questions.length === 0 && <Alert tone="neutral">This kit has no questions left. Add at least one before saving.</Alert>}

      <SaveBar dirty={dirty} isSaving={isSaving} justSaved={justSaved} error={saveError} onSave={handleSave} />
    </div>
  );
}
