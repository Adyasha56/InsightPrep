import { Tag } from "@/components/ui/tag";
import { Alert } from "@/components/feedback/alert";
import { Coverage, Role } from "@/types/kit";

// Coverage is decided entirely server-side (the deterministic coverage
// service, Phase 6) — this just renders the same uncovered-id list against
// the requirement text, so the user can see *which* requirements still need
// a question rather than only a count.
export function CoverageView({ role, coverage }: { role: Role; coverage: Coverage }) {
  if (role.requirements.length === 0) return null;

  const uncoveredIds = new Set(coverage.uncovered_requirement_ids);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Coverage</h2>

      {uncoveredIds.size === 0 ? (
        <Alert tone="success">Every requirement is covered by at least one question.</Alert>
      ) : (
        <Alert tone="neutral">
          {uncoveredIds.size} of {role.requirements.length} requirement(s) aren&apos;t covered by a question yet.
        </Alert>
      )}

      <ul className="flex flex-col divide-y divide-rule">
        {role.requirements.map((requirement) => (
          <li key={requirement.id} className="flex flex-wrap items-center gap-2 py-1.5">
            {uncoveredIds.has(requirement.id) ? (
              <Tag tone="danger">Uncovered</Tag>
            ) : (
              <Tag tone="success">Covered</Tag>
            )}
            <span className="text-ink">{requirement.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
