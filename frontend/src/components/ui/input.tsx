"use client";

import { InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          "rounded-(--radius-input) border-[1.5px] border-rule bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-muted",
          "transition-colors duration-(--dur-fast) focus-visible:border-cyan focus-visible:outline-2 focus-visible:outline-focus",
          error && "border-danger",
          className
        )}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});
