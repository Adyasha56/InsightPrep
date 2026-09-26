import { Container } from "@/components/ui/container";
import { KitDetail } from "@/features/kits/kit-detail";

export default async function KitDetailPage({ params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;

  return (
    <Container width="wide" className="py-14">
      <KitDetail kitId={kitId} />
    </Container>
  );
}
