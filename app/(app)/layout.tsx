import BottomNav from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[var(--background)]">
      <main className="flex-1 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
