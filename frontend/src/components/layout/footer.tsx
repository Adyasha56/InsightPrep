// Ft2 Inline single line — an honest one-line footer rather than a
// four-column link grid padded out with invented destinations.
export function Footer() {
  return (
    <footer className="border-t-[1.5px] border-dashed border-rule">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-6 py-6 text-sm text-muted sm:flex-row sm:justify-between">
        <span>InsightPrep</span>
        <span>Interview preparation, built from evidence.</span>
      </div>
    </footer>
  );
}
