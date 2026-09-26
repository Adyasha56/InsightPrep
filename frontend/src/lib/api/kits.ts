import { apiRequest } from "./client";
import { CreateKitInput, Kit, KitListItem, RecordFlashcardPracticeInput, RegenerateKitInput, UpdateKitInput } from "@/types/kit";

export function getKits(): Promise<{ kits: KitListItem[] }> {
  return apiRequest("/kits");
}

export function getKit(kitId: string): Promise<{ kit: Kit }> {
  return apiRequest(`/kits/${kitId}`);
}

export function createKit(input: CreateKitInput): Promise<{ kit: Kit }> {
  return apiRequest("/kits", { method: "POST", body: input });
}

export function generateKit(kitId: string): Promise<{ kit: Kit }> {
  return apiRequest(`/kits/${kitId}/generate`, { method: "POST" });
}

export function updateKit(kitId: string, input: UpdateKitInput): Promise<{ kit: Kit }> {
  return apiRequest(`/kits/${kitId}`, { method: "PATCH", body: input });
}

export function regenerateKit(kitId: string, input: RegenerateKitInput): Promise<{ kit: Kit }> {
  return apiRequest(`/kits/${kitId}/regenerate`, { method: "POST", body: input });
}

export function recordFlashcardPractice(
  kitId: string,
  flashcardId: string,
  input: RecordFlashcardPracticeInput
): Promise<{ kit: Kit }> {
  return apiRequest(`/kits/${kitId}/flashcards/${flashcardId}/practice`, { method: "PATCH", body: input });
}
