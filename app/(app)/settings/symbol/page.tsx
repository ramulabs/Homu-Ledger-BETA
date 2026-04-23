"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { updateHouseholdSymbol } from "@/app/actions/households";
import { cn } from "@/lib/cn";

const SYMBOL_GRID = [
  "🏠", "🏡", "🏘", "🏰", "🏯",
  "🌊", "🌿", "🌸", "🌺", "🌻",
  "🌴", "🍀", "🌈", "🌙", "⭐",
  "🌟", "💫", "☀️", "🔥", "❄️",
  "❤️", "💙", "💚", "💜", "🧡",
  "🐾", "🦁", "🐬", "🦋", "🦅",
  "🐉", "🎵", "🎨", "📚", "🎯",
  "🔑", "💡", "🎪", "🌍", "🎄",
];

type Props = {
  searchParams: Promise<{ current?: string }>;
};

export default function SymbolPickerPage({ searchParams }: Props) {
  const router = useRouter();

  async function handlePick(symbol: string) {
    await updateHouseholdSymbol(symbol);
    router.back();
  }

  return (
    <div className="pb-10">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">Ledger Symbol</h1>
        <div className="h-9 w-9" />
      </header>

      <p className="mt-2 px-6 text-[13px] text-[var(--label-secondary)]">
        Pick an emoji to represent this ledger.
      </p>

      <div className="mx-5 mt-4 grid grid-cols-5 gap-3">
        {SYMBOL_GRID.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handlePick(emoji)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-2xl bg-[var(--surface)] text-[28px] ring-1 ring-black/[0.06] transition-all active:scale-95 active:bg-black/[0.04]"
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
