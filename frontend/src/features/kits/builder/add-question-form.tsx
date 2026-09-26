"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { QuestionDifficulty } from "@/types/kit";

const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

export function AddQuestionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { prompt: string; answer_outline: string; difficulty: QuestionDifficulty }) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [answerOutline, setAnswerOutline] = useState("");
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(2);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !answerOutline.trim()) return;
    onAdd({ prompt: prompt.trim(), answer_outline: answerOutline.trim(), difficulty });
    setPrompt("");
    setAnswerOutline("");
    setDifficulty(2);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-(--radius-card) border-[1.5px] border-dashed border-rule p-5"
    >
      <Textarea label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="min-h-0" required />
      <Textarea
        label="Answer outline"
        value={answerOutline}
        onChange={(e) => setAnswerOutline(e.target.value)}
        rows={3}
        className="min-h-0"
        required
      />
      <Select
        label="Difficulty"
        value={difficulty}
        onChange={(e) => setDifficulty(Number(e.target.value) as QuestionDifficulty)}
        className="max-w-40"
      >
        {([1, 2, 3] as QuestionDifficulty[]).map((value) => (
          <option key={value} value={value}>
            {DIFFICULTY_LABEL[value]}
          </option>
        ))}
      </Select>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary">
          Add question
        </Button>
      </div>
    </form>
  );
}
