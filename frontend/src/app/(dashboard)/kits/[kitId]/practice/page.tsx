import { Container } from "@/components/ui/container";
import { PracticeMode } from "@/features/kits/practice/practice-mode";

export default async function PracticeModePage({ params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;

  return (
    <Container width="narrow" className="py-14">
      <PracticeMode kitId={kitId} />
    </Container>
  );
}
