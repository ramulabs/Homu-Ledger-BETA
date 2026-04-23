"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Check } from "lucide-react";
import { switchHousehold, createNewLedger } from "@/app/actions/households";
import { cn } from "@/lib/cn";
import { CURRENCIES } from "@/lib/currencies";
import type { DbHouseholdMembership } from "@/lib/types";

type Props = {
  memberships: DbHouseholdMembership[];
  currentHouseholdId: string;
  onClose: () => void;
};

export default function LedgerSwitcherSheet({ memberships, currentHouseholdId, onClose }: Props) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("IDR");

  async function handleSwitch(householdId: string) {
    if (householdId === currentHouseholdId) { onClose(); return; }
    setSwitching(householdId);
    const result = await switchHousehold(householdId);
    if (result.error) { setSwitching(null); return; }
    router.refresh();
    onClose();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    const fd = new FormData();
    fd.set("name", newName);
    fd.set("currency", newCurrency);
    const result = await createNewLedger(fd);
    if (result.error) {
      setCreateError(result.error);
      setCreating(false);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 z-[90] flex max-h-[80dvh] w-full max-w-md -translate-x-1/2 flex-col rounded-t-3xl bg-[var(--surface)]">
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-1">
          <h3 className="text-[17px] font-semibold text-[var(--foreground)]">My Ledgers</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)]">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <ul className="overflow-hidden rounded-2xl bg-[var(--background)] ring-1 ring-black/[0.06] divide-y divide-[var(--separator)]">
            {memberships.map(({ household_id, role, household }) => {
              const isCurrent = household_id === currentHouseholdId;
              const isLoading = switching === household_id;
              return (
                <li key={household_id}>
                  <button
                    onClick={() => handleSwitch(household_id)}
                    disabled={!!switching}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-black/[0.02] disabled:opacity-60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[20px] ring-1 ring-black/[0.06]">
                      {(household as any).symbol ?? "🏠"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">{household.name}</p>
                      <p className="text-[12px] text-[var(--label-secondary)]">
                        {role === "owner" ? "Owner" : "Member"} · {household.currency}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--foreground)]">
                        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                      </span>
                    )}
                    {isLoading && (
                      <span className="text-[12px] text-[var(--label-secondary)]">Switching…</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-[var(--separator)] bg-[var(--surface)] px-5 pb-8 pt-4">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--background)] py-3.5 text-[14px] font-medium text-[var(--label-secondary)] ring-1 ring-black/[0.06] transition-colors active:bg-black/[0.04]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Create new ledger
            </button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <p className="text-[13px] font-medium text-[var(--label-secondary)]">New ledger</p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Vacation Fund"
                required
                autoFocus
                className="h-12 w-full rounded-xl bg-[var(--background)] px-3 text-[15px] text-[var(--foreground)] outline-none ring-1 ring-black/[0.08] placeholder:text-[var(--label-tertiary)] focus:ring-2 focus:ring-[var(--foreground)]/20"
              />
              <select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                className="h-12 w-full rounded-xl bg-[var(--background)] px-3 text-[15px] text-[var(--foreground)] outline-none ring-1 ring-black/[0.08] focus:ring-2 focus:ring-[var(--foreground)]/20"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
              {createError && <p className="text-[12px] text-rose-600">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--background)] text-[14px] font-medium text-[var(--label-secondary)] ring-1 ring-black/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--foreground)] text-[14px] font-semibold text-white transition-opacity disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
