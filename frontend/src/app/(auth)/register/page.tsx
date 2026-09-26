import { RegisterForm } from "@/features/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl text-ink">Create your account</h1>
        <p className="text-neutral">Prepare with evidence, one kit at a time.</p>
      </div>
      <RegisterForm />
    </div>
  );
}
