"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createKit } from "@/lib/api/kits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/feedback/alert";
import { ApiError } from "@/lib/api/errors";
import { ROUTES } from "@/constants/routes";

export function CreateKitForm() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [daysAvailable, setDaysAvailable] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { kit } = await createKit({
        job_description: jobDescription,
        company_url: companyUrl,
        days_available: daysAvailable,
      });
      router.push(ROUTES.kit(kit._id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the kit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <Alert tone="danger">{error}</Alert>}
      <Input
        label="Company URL"
        type="url"
        required
        placeholder="https://example.com"
        value={companyUrl}
        onChange={(event) => setCompanyUrl(event.target.value)}
        hint="InsightPrep will research this company's public site."
      />
      <Textarea
        label="Job description"
        required
        placeholder="Paste the job description here."
        value={jobDescription}
        onChange={(event) => setJobDescription(event.target.value)}
      />
      <Input
        label="Days until interview"
        type="number"
        min={1}
        max={60}
        required
        value={daysAvailable}
        onChange={(event) => setDaysAvailable(Number(event.target.value))}
        hint="Between 1 and 60 days."
      />
      <Button type="submit" isLoading={isSubmitting} className="self-start">
        Create kit
      </Button>
    </form>
  );
}
