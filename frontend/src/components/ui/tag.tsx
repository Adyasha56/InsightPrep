import { cn } from "@/lib/utils";

type TagTone = "neutral" | "success" | "warning" | "danger" | "accent" | "cyan" | "lavender";

const TONE_CLASSES: Record<TagTone, string> = {
  neutral: "bg-paper-2 text-neutral",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  accent: "bg-accent text-ink",
  cyan: "bg-cyan-bg text-cyan",
  lavender: "bg-lavender-bg text-ink",
};

// Rounded pill chip — Hum has no square corners anywhere, including status
// tags. Colour is a supporting signal; the label is still the primary one.
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: TagTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 font-data text-xs font-medium uppercase tracking-wide",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
