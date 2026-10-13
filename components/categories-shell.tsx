"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import EditCategorySheet from "@/components/edit-category-sheet";
import AddCategorySheet from "@/components/add-category-sheet";
import { CategoryIcon } from "@/components/category-icon";
import type { DbCategory, TransactionType } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";
import StickyHeader from "@/components/ui/sticky-header";
import SegmentedControl from "@/components/ui/segmented-control";

type Props = {
  categories: DbCategory[];
  iconStyle?: IconStyle;
};

export default function CategoriesShell({ categories: initial, iconStyle = "2d" }: Props) {
  const [categories, setCategories] = useState(initial);
  const [editing, setEditing] = useState<DbCategory | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TransactionType>("expense");

  function openEdit(cat: DbCategory) {
    setEditing(cat);
    setSheetOpen(true);
  }

  function handleUpdated(updated: DbCategory) {
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleDeleted(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  function handleAdded(cat: DbCategory) {
    setCategories((prev) => [cat, ...prev]);
  }

  const visible = useMemo(
    () => categories.filter((c) => c.type === activeTab),
    [categories, activeTab]
  );

  return (
    <>
      <div className="pb-10">
        {/* Sticky band: title row + Expense/Income tab pill, both pinned
            together so the tabs stay reachable while scrolling the list. */}
        <div className="sticky top-[env(safe-area-inset-top)] z-20 bg-[var(--background)]/95 backdrop-blur">
          <StickyHeader
            title="Categories" sticky={false}
            right={
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Add category"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--foreground)] text-[var(--on-foreground)] shadow-[var(--shadow-card)] active:scale-95 transition-transform [touch-action:manipulation]"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </button>
            }
          />
          <div className="px-5 pb-3">
            <SegmentedControl
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />
          </div>
        </div>

        <section className="mt-4">
          {visible.length === 0 ? (
            <p className="mx-5 rounded-2xl bg-[var(--surface)] p-6 text-center text-[13px] text-[var(--label-secondary)] ring-1 ring-[var(--ring-subtle)]">
              No {activeTab} categories yet. Tap + to add one.
            </p>
          ) : (
            <ul className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--ring-subtle)] divide-y divide-[var(--separator)]">
              {visible.map((cat) => (
                <CategoryRow key={cat.id} cat={cat} iconStyle={iconStyle} onTap={openEdit} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <EditCategorySheet
        open={sheetOpen}
        category={editing}
        iconStyle={iconStyle}
        onClose={() => setSheetOpen(false)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />

      <AddCategorySheet
        open={addOpen}
        type={activeTab}
        onClose={() => setAddOpen(false)}
        onAdded={handleAdded}
        iconStyle={iconStyle}
      />
    </>
  );
}

function CategoryRow({
  cat,
  iconStyle = "2d",
  onTap,
}: {
  cat: DbCategory;
  iconStyle?: IconStyle;
  onTap: (c: DbCategory) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onTap(cat)}
        className="flex w-full items-center gap-3 px-4 py-3 min-h-[56px] text-left active:bg-[var(--fill-quaternary)] transition-colors"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[20px]"
          style={{ backgroundColor: `${cat.color}22` }}
        >
          <CategoryIcon
            symbol={cat.symbol}
            iconStyle={iconStyle}
            size={20}
            emojiSize="20px"
            color={iconStyle === "2d" ? cat.color : undefined}
          />
        </div>
        <p className="flex-1 text-[15px] font-medium text-[var(--foreground)]">{cat.name}</p>
        <ChevronRight className="h-[18px] w-[18px] text-[var(--label-tertiary)]" strokeWidth={2} />
      </button>
    </li>
  );
}
