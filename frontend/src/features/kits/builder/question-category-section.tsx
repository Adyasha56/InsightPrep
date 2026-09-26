"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { AddQuestionForm } from "./add-question-form";
import { QuestionCard } from "./question-card";
import { RegenerateButton } from "./regenerate-button";
import { Question, QuestionCategory, QuestionDifficulty } from "@/types/kit";

const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

const CATEGORY_TONE: Record<QuestionCategory, "cyan" | "lavender" | "accent" | "success"> = {
  technical: "cyan",
  behavioural: "lavender",
  "system-design": "accent",
  "company-fit": "success",
};

export function QuestionCategorySection({
  category,
  questions,
  onChangeQuestion,
  onMoveQuestion,
  onDeleteQuestion,
  onAddQuestion,
  onRegenerateCategory,
  regenerateDisabled,
  regenerateDisabledReason,
}: {
  category: QuestionCategory;
  questions: Question[];
  onChangeQuestion: (id: string, patch: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty" | "category">>) => void;
  onMoveQuestion: (id: string, direction: "up" | "down") => void;
  onDeleteQuestion: (id: string) => void;
  onAddQuestion: (category: QuestionCategory, input: { prompt: string; answer_outline: string; difficulty: QuestionDifficulty }) => void;
  onRegenerateCategory: (category: QuestionCategory) => Promise<void>;
  regenerateDisabled?: boolean;
  regenerateDisabledReason?: string;
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <section className="flex flex-col gap-4" data-testid={`category-section-${category}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tag tone={CATEGORY_TONE[category]}>{CATEGORY_LABEL[category]}</Tag>
          <span className="font-data text-xs text-muted">{questions.length}</span>
        </div>
        <RegenerateButton
          label="Regenerate category"
          confirmMessage="This replaces unedited generated questions in this category. Your own and edited questions are kept."
          disabled={regenerateDisabled}
          disabledReason={regenerateDisabledReason}
          onRegenerate={() => onRegenerateCategory(category)}
        />
      </div>

      {questions.length === 0 && !isAdding && (
        <p className="text-sm text-muted">No {CATEGORY_LABEL[category].toLowerCase()} questions yet.</p>
      )}

      <div className="flex flex-col gap-4">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            isFirst={index === 0}
            isLast={index === questions.length - 1}
            onChange={(patch) => onChangeQuestion(question.id, patch)}
            onMove={(direction) => onMoveQuestion(question.id, direction)}
            onDelete={() => onDeleteQuestion(question.id)}
          />
        ))}
      </div>

      {isAdding ? (
        <AddQuestionForm
          onAdd={(input) => {
            onAddQuestion(category, input);
            setIsAdding(false);
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <Button variant="ghost" className="self-start" onClick={() => setIsAdding(true)}>
          + Add question
        </Button>
      )}
    </section>
  );
}
