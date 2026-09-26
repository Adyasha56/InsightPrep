"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { Flashcard } from "@/types/kit";

const CONFIDENCE_TAG: Record<NonNullable<Flashcard["confidence"]>, { label: string; tone: "danger" | "warning" | "success" }> = {
  low: { label: "Low confidence", tone: "danger" },
  medium: { label: "Medium confidence", tone: "warning" },
  high: { label: "High confidence", tone: "success" },
};

function FlashcardCard({
  flashcard,
  onChange,
  onDelete,
}: {
  flashcard: Flashcard;
  onChange: (patch: Partial<Pick<Flashcard, "front" | "back">>) => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-card) border-[1.5px] border-rule bg-paper p-5" data-testid="flashcard-card">
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="origin-tag">
        {flashcard.origin === "user" ? (
          <Tag tone="lavender">Your card</Tag>
        ) : flashcard.edited ? (
          <Tag tone="cyan">Edited</Tag>
        ) : (
          <Tag tone="neutral">Generated</Tag>
        )}
        <Tag tone={flashcard.confidence ? CONFIDENCE_TAG[flashcard.confidence].tone : "neutral"}>
          {flashcard.confidence ? CONFIDENCE_TAG[flashcard.confidence].label : "Not yet practiced"}
        </Tag>
      </div>
      <Input label="Front" value={flashcard.front} onChange={(e) => onChange({ front: e.target.value })} />
      <Input label="Back" value={flashcard.back} onChange={(e) => onChange({ back: e.target.value })} />
      <div className="flex justify-end">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral">Delete this card?</span>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="text-danger"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              Confirm delete
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function AddFlashcardForm({ onAdd, onCancel }: { onAdd: (input: { front: string; back: string }) => void; onCancel: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!front.trim() || !back.trim()) return;
    onAdd({ front: front.trim(), back: back.trim() });
    setFront("");
    setBack("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-(--radius-card) border-[1.5px] border-dashed border-rule p-5"
    >
      <Input label="Front" value={front} onChange={(e) => setFront(e.target.value)} required />
      <Input label="Back" value={back} onChange={(e) => setBack(e.target.value)} required />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary">
          Add flashcard
        </Button>
      </div>
    </form>
  );
}

export function FlashcardEditor({
  flashcards,
  onChangeFlashcard,
  onDeleteFlashcard,
  onAddFlashcard,
}: {
  flashcards: Flashcard[];
  onChangeFlashcard: (id: string, patch: Partial<Pick<Flashcard, "front" | "back">>) => void;
  onDeleteFlashcard: (id: string) => void;
  onAddFlashcard: (input: { front: string; back: string }) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Flashcards</h2>
        <span className="font-data text-xs text-muted">{flashcards.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {flashcards.map((flashcard) => (
          <FlashcardCard
            key={flashcard.id}
            flashcard={flashcard}
            onChange={(patch) => onChangeFlashcard(flashcard.id, patch)}
            onDelete={() => onDeleteFlashcard(flashcard.id)}
          />
        ))}
      </div>

      {isAdding ? (
        <AddFlashcardForm
          onAdd={(input) => {
            onAddFlashcard(input);
            setIsAdding(false);
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <Button variant="ghost" className="self-start" onClick={() => setIsAdding(true)}>
          + Add flashcard
        </Button>
      )}
    </section>
  );
}
