"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { Question, QuestionCategory, QuestionDifficulty } from "@/types/kit";

const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

export function QuestionCard({
  question,
  isFirst,
  isLast,
  onChange,
  onMove,
  onDelete,
}: {
  question: Question;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty" | "category">>) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-card) border-[1.5px] border-rule bg-paper p-5" data-testid="question-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2" data-testid="origin-tag">
          {question.origin === "user" ? (
            <Tag tone="lavender">Your question</Tag>
          ) : question.edited ? (
            <Tag tone="cyan">Edited</Tag>
          ) : (
            <Tag tone="neutral">Generated</Tag>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={isFirst}
            aria-label="Move question up"
            className="rounded-(--radius-input) px-2 py-1 text-sm text-neutral hover:bg-paper-2 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={isLast}
            aria-label="Move question down"
            className="rounded-(--radius-input) px-2 py-1 text-sm text-neutral hover:bg-paper-2 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ↓
          </button>
        </div>
      </div>

      <Textarea
        label="Prompt"
        value={question.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        rows={2}
        className="min-h-0"
      />
      <Textarea
        label="Answer outline"
        value={question.answer_outline}
        onChange={(e) => onChange({ answer_outline: e.target.value })}
        rows={4}
        className="min-h-0"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Difficulty"
          value={question.difficulty}
          onChange={(e) => onChange({ difficulty: Number(e.target.value) as QuestionDifficulty })}
        >
          {([1, 2, 3] as QuestionDifficulty[]).map((value) => (
            <option key={value} value={value}>
              {DIFFICULTY_LABEL[value]}
            </option>
          ))}
        </Select>
        <Select
          label="Category"
          value={question.category}
          onChange={(e) => onChange({ category: e.target.value as QuestionCategory })}
        >
          {(Object.keys(CATEGORY_LABEL) as QuestionCategory[]).map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex justify-end">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral">Delete this question?</span>
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
