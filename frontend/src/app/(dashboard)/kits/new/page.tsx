import { Container } from "@/components/ui/container";
import { CreateKitForm } from "@/features/kits/create-kit-form";

export default function NewKitPage() {
  return (
    <Container width="default" className="flex flex-col gap-10 py-14">
      <div className="flex flex-col gap-2">
        <p className="font-data text-xs uppercase tracking-widest text-muted">New kit</p>
        <h1 className="text-3xl text-ink">Start a new preparation kit</h1>
        <p className="max-w-prose text-neutral">
          Give us the job description, the company, and how many days you have. We&apos;ll research the company and
          build your kit from there.
        </p>
      </div>
      <CreateKitForm />
    </Container>
  );
}
