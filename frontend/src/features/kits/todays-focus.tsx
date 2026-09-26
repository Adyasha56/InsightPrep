import Link from "next/link";
import { Tag } from "@/components/ui/tag";
import { Kit, ScheduleDay } from "@/types/kit";

// Pure and derived — no persistence, no new backend field. Maps elapsed
// calendar days since the kit was created onto the deterministic scheduler's
// day numbers (Phase 7), so "today" always tracks the same schedule the
// Schedule section shows. Clamped to the schedule's own range: before day 1
// it shows day 1, past the last day it stays on the final review day rather
// than showing nothing.
export function computeTodayScheduleDay(kit: Pick<Kit, "createdAt" | "schedule">): ScheduleDay | null {
  if (kit.schedule.days.length === 0) return null;

  const createdMs = new Date(kit.createdAt).getTime();
  const daysElapsed = Math.floor((Date.now() - createdMs) / (24 * 60 * 60 * 1000));
  const dayNumber = Math.min(Math.max(daysElapsed + 1, 1), kit.schedule.days_available);

  return kit.schedule.days.find((day) => day.day === dayNumber) ?? null;
}

export function TodaysFocus({ kit }: { kit: Kit }) {
  const today = computeTodayScheduleDay(kit);
  if (!today) return null;

  const questionsById = new Map(kit.questions.map((question) => [question.id, question]));
  const todaysQuestions = today.question_ids.map((id) => questionsById.get(id)).filter((q) => q !== undefined);

  return (
    <section className="flex flex-col gap-3 rounded-(--radius-card) border-[1.5px] border-coral bg-coral-bg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tag tone="danger">
          Today · Day {today.day} of {kit.schedule.days_available}
        </Tag>
        <span className="font-data text-xs text-muted">{today.minutes} min</span>
      </div>
      <p className="text-lg text-ink">{today.focus}</p>

      {todaysQuestions.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-neutral">
          {todaysQuestions.map((question) => (
            <li key={question.id}>· {question.prompt}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral">No new questions today — a good day to review what you&apos;ve already covered.</p>
      )}

      <Link href="#schedule" className="text-sm font-medium text-ink underline underline-offset-2 hover:text-coral">
        See full schedule ↓
      </Link>
    </section>
  );
}
