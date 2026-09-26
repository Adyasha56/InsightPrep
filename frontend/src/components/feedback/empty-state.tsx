export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-t-[1.5px] border-dashed border-rule py-16">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="max-w-prose text-neutral">{description}</p>
      {action}
    </div>
  );
}
