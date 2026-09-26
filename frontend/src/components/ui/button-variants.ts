import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";

// Maps our simple 3-variant API onto Hum's canonical .btn system (globals.css):
// primary = push (the chunky one, pear-yellow, colour-edge shadow),
// secondary = soft (flat-lift tint), ghost = outline (hairline).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "btn",
  secondary: "btn btn--soft",
  ghost: "btn btn--outline",
};

// Deliberately not in button.tsx: that file is a client component ("use
// client" for the interactive <button>), and a plain string-building
// function has no reason to be client-only. Splitting it out lets Server
// Components (e.g. the marketing page) style a <Link> as a button without
// pulling in client-only code.
export function buttonVariants(variant: ButtonVariant = "primary", className?: string): string {
  return cn(VARIANT_CLASSES[variant], className);
}
