import { Flashcard, FlashcardConfidence } from "@/types/kit";

// Never-practiced cards need the most attention, then low, then medium;
// high-confidence cards are least urgent to see again.
function tierRank(confidence: FlashcardConfidence): number {
  if (confidence === null) return 0;
  if (confidence === "low") return 1;
  if (confidence === "medium") return 2;
  return 3; // "high"
}

// Pure and stable (Array.prototype.sort is stable in all supported
// engines), so cards within the same tier keep their original relative
// order rather than being shuffled every time a session starts.
export function sortByPracticePriority(flashcards: Flashcard[]): Flashcard[] {
  return [...flashcards].sort((a, b) => tierRank(a.confidence) - tierRank(b.confidence));
}
