import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl text-ink">Log in</h1>
        <p className="text-neutral">Pick up where you left off.</p>
      </div>
      <LoginForm />
    </div>
  );
}
