"use client";

import { TextareaHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={Boolean(error)}
        className={cn(
          "min-h-40 rounded-(--radius-input) border-[1.5px] border-rule bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-muted",
          "transition-colors duration-(--dur-fast) focus-visible:border-cyan focus-visible:outline-2 focus-visible:outline-focus",
          error && "border-danger",
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
});
