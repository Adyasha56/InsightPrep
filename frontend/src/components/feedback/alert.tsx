import { cn } from "@/lib/utils";

type AlertTone = "danger" | "success" | "neutral";

const TONE_CLASSES: Record<AlertTone, string> = {
  danger: "bg-danger-bg text-danger",
  success: "bg-success-bg text-success",
  neutral: "bg-paper-2 text-neutral",
};

export function Alert({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: AlertTone;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-(--radius-input) px-4 py-3 text-sm", TONE_CLASSES[tone], className)}
    >
      {children}
    </div>
  );
}
