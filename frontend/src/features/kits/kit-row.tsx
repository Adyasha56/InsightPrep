import Link from "next/link";
import { KitListItem, GenerationStatus } from "@/types/kit";
import { Tag } from "@/components/ui/tag";
import { formatDate, truncate } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";

const STATUS_LABEL: Record<GenerationStatus, string> = {
  idle: "Not started",
  researching: "Researching",
  generating: "Generating",
  completed: "Ready",
  failed: "Failed",
};

const STATUS_TONE: Record<GenerationStatus, "neutral" | "warning" | "success" | "danger"> = {
  idle: "neutral",
  researching: "warning",
  generating: "warning",
  completed: "success",
  failed: "danger",
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function KitRow({ kit }: { kit: KitListItem }) {
  const hostname = hostnameOf(kit.source.company_url);

  return (
    <Link
      href={ROUTES.kit(kit._id)}
      className="flex flex-col gap-3 rounded-(--radius-card) bg-accent-bg/40 p-5 transition-all duration-200 ease-(--ease-spring) hover:-translate-y-1 hover:bg-accent-bg hover:shadow-lg sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg font-semibold text-ink">{kit.role.title || hostname}</span>
        <span className="text-sm text-neutral">
          {hostname} · {truncate(kit.source.job_description, 80)}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm text-neutral">
        <span className="font-data text-xs">{kit.source.days_available}d</span>
        <span>{formatDate(kit.updatedAt)}</span>
        {kit.generationStatus === "completed" && kit.coverage.uncovered_requirement_ids.length > 0 && (
          <Tag tone="warning">{kit.coverage.uncovered_requirement_ids.length} uncovered</Tag>
        )}
        <Tag tone={STATUS_TONE[kit.generationStatus]}>{STATUS_LABEL[kit.generationStatus]}</Tag>
      </div>
    </Link>
  );
}
