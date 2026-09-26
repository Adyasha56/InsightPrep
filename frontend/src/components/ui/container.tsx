import { cn } from "@/lib/utils";

type ContainerWidth = "narrow" | "default" | "wide";

const WIDTH_CLASSES: Record<ContainerWidth, string> = {
  narrow: "max-w-md",
  default: "max-w-3xl",
  wide: "max-w-5xl",
};

export function Container({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  width?: ContainerWidth;
}) {
  return <div className={cn("mx-auto w-full px-6", WIDTH_CLASSES[width], className)}>{children}</div>;
}
