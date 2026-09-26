import { Tag } from "@/components/ui/tag";
import { Requirement, RequirementKind, Role } from "@/types/kit";

const KIND_TONE: Record<RequirementKind, "cyan" | "lavender" | "accent"> = {
  technical: "cyan",
  behavioural: "lavender",
  domain: "accent",
};

function RequirementRow({ requirement }: { requirement: Requirement }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <Tag tone={KIND_TONE[requirement.kind]}>{requirement.kind}</Tag>
      {requirement.priority === "must" && <Tag tone="warning">must-have</Tag>}
      <span className="text-ink">{requirement.text}</span>
    </li>
  );
}

// Read-only — Role/Requirements have no builder in this app; they're
// established at generation time and shown here purely for orientation.
export function RoleSummary({ role }: { role: Role }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Role &amp; requirements</h2>
      <div className="flex flex-col gap-1">
        <p className="text-lg text-ink">
          {role.title || "Untitled role"}
          {role.seniority && <span className="text-neutral"> · {role.seniority}</span>}
        </p>
        {role.responsibilities.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-neutral">
            {role.responsibilities.map((responsibility) => (
              <li key={responsibility}>{responsibility}</li>
            ))}
          </ul>
        )}
      </div>
      {role.requirements.length > 0 && (
        <ul className="flex flex-col divide-y divide-rule">
          {role.requirements.map((requirement) => (
            <RequirementRow key={requirement.id} requirement={requirement} />
          ))}
        </ul>
      )}
    </section>
  );
}
