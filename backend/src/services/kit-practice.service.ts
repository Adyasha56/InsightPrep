import { KitDocument } from "../models/kit.model";
import { validateDraftKit } from "../validators/kit.validator";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { DraftKit, FlashcardConfidence } from "../types/kit.types";

// Recording confidence is deliberately separate from the Phase 10 content-
// editing PATCH: it never touches `edited`/origin (self-grading a card isn't
// "editing" it) and never recomputes coverage/schedule, since it doesn't
// touch questions at all. Confidence lives on the flashcard itself, so
// deleting a card (Phase 10) or regenerating anything (Phase 11, which never
// touches flashcards) can't leave orphaned practice state behind.
export function recordFlashcardConfidence(kit: KitDocument, flashcardId: string, confidence: FlashcardConfidence): DraftKit {
  const current = kit.toObject() as unknown as DraftKit;

  const exists = current.flashcards.some((flashcard) => flashcard.id === flashcardId);
  if (!exists) {
    throw new AppError(ErrorCode.INVALID_KIT, `Unknown flashcard id "${flashcardId}".`, 400);
  }

  const flashcards = current.flashcards.map((flashcard) =>
    flashcard.id === flashcardId ? { ...flashcard, confidence } : flashcard
  );

  return validateDraftKit({ ...current, flashcards });
}
