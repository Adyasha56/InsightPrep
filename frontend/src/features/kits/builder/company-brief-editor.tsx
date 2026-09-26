"use client";

import { Textarea } from "@/components/ui/textarea";
import { Tag } from "@/components/ui/tag";
import { CompanyBrief } from "@/types/kit";
import { RegenerateButton } from "./regenerate-button";

export function CompanyBriefEditor({
  brief,
  onChange,
  onRegenerate,
  regenerateDisabled,
  regenerateDisabledReason,
}: {
  brief: Pick<CompanyBrief, "summary" | "what_they_do" | "edited">;
  onChange: (patch: Partial<Pick<CompanyBrief, "summary" | "what_they_do">>) => void;
  onRegenerate: () => Promise<void>;
  regenerateDisabled?: boolean;
  regenerateDisabledReason?: string;
}) {
  return (
    <section className="flex flex-col gap-3" data-testid="company-brief-section">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Company brief</h2>
        {brief.edited && <Tag tone="cyan">Edited</Tag>}
      </div>
      <Textarea
        label="Summary"
        value={brief.summary}
        onChange={(e) => onChange({ summary: e.target.value })}
        rows={3}
        className="min-h-0"
      />
      <Textarea
        label="What they do"
        value={brief.what_they_do}
        onChange={(e) => onChange({ what_they_do: e.target.value })}
        rows={3}
        className="min-h-0"
      />
      <RegenerateButton
        label="Regenerate brief"
        confirmMessage="This replaces your company brief with freshly generated content."
        disabled={regenerateDisabled}
        disabledReason={regenerateDisabledReason}
        onRegenerate={onRegenerate}
      />
    </section>
  );
}
