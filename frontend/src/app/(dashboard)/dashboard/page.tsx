import Link from "next/link";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button-variants";
import { KitList } from "@/features/kits/kit-list";
import { ROUTES } from "@/constants/routes";

export default function DashboardPage() {
  return (
    <Container width="wide" className="flex flex-col gap-10 py-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-data text-xs uppercase tracking-widest text-muted">Interview prep</p>
          <h1 className="text-3xl text-ink">Your preparation space</h1>
        </div>
        <Link href={ROUTES.newKit} className={buttonVariants("primary")}>
          Create a new kit
        </Link>
      </div>

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Recent preparation</h2>
        <KitList />
      </div>
    </Container>
  );
}
