import { Tag } from "@/components/ui/tag";
import { Question, Schedule } from "@/types/kit";

// Read-only — the deterministic scheduler (Phase 7) already decided
// placement, order, and timing; this only resolves question_ids to their
// prompts for display. Regenerating the schedule is a builder action
// (Phase 11), not something this view does itself.
export function ScheduleView({ schedule, questions }: { schedule: Schedule; questions: Question[] }) {
  const questionsById = new Map(questions.map((question) => [question.id, question]));

  return (
    <section className="flex flex-col gap-4" id="schedule">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Schedule</h2>
      <div className="flex flex-col gap-4">
        {schedule.days.map((day) => (
          <div key={day.day} className="flex flex-col gap-2 rounded-(--radius-card) border-[1.5px] border-rule bg-paper p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display text-base text-ink">Day {day.day}</span>
              <span className="font-data text-xs text-muted">{day.minutes} min</span>
            </div>
            <p className="text-sm text-neutral">{day.focus}</p>
            {day.question_ids.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1.5">
                {day.question_ids.map((id) => {
                  const question = questionsById.get(id);
                  if (!question) return null;
                  return (
                    <li key={id} className="flex items-start gap-2 text-sm">
                      <Tag tone="neutral" className="mt-0.5 shrink-0">
                        {question.category}
                      </Tag>
                      <span className="text-ink">{question.prompt}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
