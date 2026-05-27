export default function ExportLoading() {
  return (
    <div className="animate-pulse pb-10">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <div className="h-9 w-9 rounded-full bg-[var(--foreground)]/[0.06]" />
        <div className="h-4 w-40 rounded-full bg-[var(--foreground)]/[0.07]" />
        <div className="h-9 w-9" />
      </div>

      {/* Intro line */}
      <div className="px-6 pt-3 space-y-2">
        <div className="h-3 w-full rounded-full bg-[var(--foreground)]/[0.05]" />
        <div className="h-3 w-3/4 rounded-full bg-[var(--foreground)]/[0.05]" />
      </div>

      {/* Format tiles */}
      <div className="mx-5 mt-6 grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-[100px] rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04]"
          />
        ))}
      </div>

      {/* Range list */}
      <div className="mx-5 mt-6 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3.5">
            <div className="h-3 w-32 rounded-full bg-[var(--foreground)]/[0.06]" />
          </div>
        ))}
      </div>

      {/* Primary action */}
      <div className="mx-5 mt-6">
        <div className="h-14 w-full rounded-2xl bg-[var(--foreground)]/[0.1]" />
      </div>
    </div>
  );
}
