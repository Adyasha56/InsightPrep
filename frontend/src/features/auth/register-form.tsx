"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/feedback/alert";
import { ApiError } from "@/lib/api/errors";
import { ROUTES } from "@/constants/routes";

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({ email, password, name: name || undefined });
      router.push(ROUTES.dashboard);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Name (optional)" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Button type="submit" isLoading={isSubmitting}>
        Create account
      </Button>
      <p className="text-sm text-neutral">
        Already have an account?{" "}
        <Link href={ROUTES.login} className="text-ink underline underline-offset-2 hover:text-cyan">
          Log in
        </Link>
      </p>
    </form>
  );
}
