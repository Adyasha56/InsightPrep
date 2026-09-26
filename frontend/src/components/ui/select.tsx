"use client";

import { SelectHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
}

// Mirrors Input's shape so a form mixing text fields and dropdowns (e.g. the
// question editor's difficulty/category pair) reads as one consistent set of
// controls rather than two different component languages.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, id, className, children, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "rounded-(--radius-input) border-[1.5px] border-rule bg-paper px-3.5 py-2.5 text-base text-ink",
          "transition-colors duration-(--dur-fast) focus-visible:border-cyan focus-visible:outline-2 focus-visible:outline-focus",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
});
