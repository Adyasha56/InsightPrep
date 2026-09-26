"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";
import { ButtonVariant, buttonVariants } from "./button-variants";

export type { ButtonVariant };
export { buttonVariants };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", isLoading, disabled, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(buttonVariants(variant), className)}
      {...props}
    >
      {isLoading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});
