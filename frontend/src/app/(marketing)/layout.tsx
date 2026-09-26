import { Masthead } from "@/components/layout/masthead";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Masthead />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
