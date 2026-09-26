import { cn } from "@/lib/utils";

// Dashed rule — Hum's documented divider language (borrowed from PostHog's
// discipline) rather than a plain solid hairline.
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t-[1.5px] border-dashed border-rule", className)} />;
}
