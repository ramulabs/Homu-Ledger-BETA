"use client";

// Edit Category — floating-bento redesign.
//
// Re-skinned to match add-category-sheet (RAM-22) and the
// category-picker bento family: floats as a rounded card with 10px
// side / 18px bottom margins, a blurred backdrop, a double-RAF
// slide-up and the same 560ms cubic-bezier motion. The form is
// curated to fit with NO internal scroll while the keyboard is down
// (24 icons, 4 rows); a visualViewport-tracked wrapper keeps the
// bento above the on-screen keyboard while the Name field is focused.
//
// Behaviour is unchanged: the update flow (updateCategory), the
// two-tap delete flow with its 3s auto-disarm (deleteCategory), and
// the open/category/onClose/onUpdated/onDeleted props are all kept so
// categories-shell is unaffected.

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { updateCategory, deleteCategory } from "@/app/actions/categories";
import { cn } from "@/lib/cn";
import { CATEGORY_LUCIDE_ICONS, makeLucideSymbol, isLucideSymbol } from "@/lib/category-icons";
import { CategoryIcon } from "@/components/category-icon";
import type { DbCategory } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";

const SOFT_PALETTE = [
  "#f97316", "#3b82f6", "#8b5cf6", "#ef4444",
  "#ec4899", "#eab308", "#14b8a6", "#22c55e", "#6b7280",
];

// Curated 24-emoji set — 4 rows × 6, sized so the bento needs no scroll.
const SYMBOLS = [
  "🏠","🚗","🚌","✈️","🍔","🍕",
  "🍜","☕","🛒","👕","💊","🏋️",
  "📚","🎬","🎮","🎵","💼","💰",
  "🏦","🎁","🐾","⚡","📱","🎓",
];

// Curated 24 Lucide icons (2D icon style) — same coverage as SYMBOLS.
const LUCIDE_PICKER_IDS = new Set([
  "home", "building-2", "car", "bus", "plane", "fuel",
  "utensils-crossed", "coffee", "shopping-cart", "shopping-bag", "shirt", "pill",
  "heart-pulse", "dumbbell", "book-open", "graduation-cap", "film", "gamepad-2",
  "music", "briefcase", "gift", "paw-print", "zap", "smartphone",
]);
const LUCIDE_PICKER = CATEGORY_LUCIDE_ICONS.filter((i) => LUCIDE_PICKER_IDS.has(i.id));

type Props = {
  open: boolean;
  category: DbCategory | null;
  iconStyle?: IconStyle;
  onClose: () => void;
  onUpdated: (cat: DbCategory) => void;
  onDeleted: (id: string) => void;
};

type IconMode = "emoji" | "symbol";

export default function EditCategorySheet({
  open,
  category,
  iconStyle = "3d",
  onClose,
  onUpdated,
  onDeleted,
}: Props) {
  const firstSymbol = iconStyle === "2d" ? makeLucideSymbol(LUCIDE_PICKER[0]?.id ?? "home") : SYMBOLS[0];

  const [name, setName] = useState("");
  const [iconMode, setIconMode] = useState<IconMode>("symbol");
  const [emoji, setEmoji] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedColor, setSelectedColor] = useState(SOFT_PALETTE[0]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSymbol = iconMode === "emoji" ? emoji : selectedSymbol;

  // ── Hydrate the form from the category each time the sheet opens.
  useEffect(() => {
    if (!open || !category) return;
    function hydrate(cat: DbCategory) {
      setName(cat.name);
      setSelectedColor(cat.color);
      setError(null);
      setLoading(false);
      setDeleting(false);
      setConfirmDelete(false);
      // Detect symbol type:
      //   - "lu:foo" (Lucide id)  -> symbol mode (Icons grid in 2D)
      //   - emoji in our grid     -> symbol mode (emoji grid in 3D)
      //   - free emoji            -> custom (emoji input)
      if (isLucideSymbol(cat.symbol) || SYMBOLS.includes(cat.symbol)) {
        setIconMode("symbol");
        setSelectedSymbol(cat.symbol);
        setEmoji("");
      } else {
        setIconMode("emoji");
        setEmoji(cat.symbol);
        setSelectedSymbol("");
      }
    }
    hydrate(category);
  }, [open, category]);

  // ── Bento enter/exit — double-RAF so the slide-up transition always
  //    has a previous state and never gets batched into an instant pop.
  //    Both branches flip `visible` inside a RAF callback (never
  //    synchronously in the effect body).
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      let r2: number | null = null;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
    const r = requestAnimationFrame(() => setVisible(false));
    return () => cancelAnimationFrame(r);
  }, [open]);

  // ── Keep the bento flush above the on-screen keyboard. The wrapper is
  //    sized + offset to overlay window.visualViewport (the visible area
  //    minus the keyboard); the bento is bottom-anchored inside it.
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const [vvOffsetTop, setVvOffsetTop] = useState(0);
  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    function update() {
      if (!vv) return;
      setVvHeight(vv.height);
      setVvOffsetTop(vv.offsetTop);
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setError(null);
    setLoading(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("symbol", currentSymbol);
    fd.set("color", selectedColor);
    const result = await updateCategory(category.id, fd);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      onUpdated({ ...category, name, symbol: currentSymbol, color: selectedColor });
      onClose();
    }
  }

  async function handleDelete() {
    if (!category) return;
    // First tap arms the confirm state; second tap (within 3s) actually
    // performs the delete. The 3s auto-disarm keeps the UI from staying
    // in a primed state if the user navigates away mid-flow.
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    const result = await deleteCategory(category.id);
    if (result.error) {
      setError(result.error);
      setDeleting(false);
      setConfirmDelete(false);
    } else {
      onDeleted(category.id);
      onClose();
    }
  }

  const canSave = !loading && !deleting && !!name.trim() && !!currentSymbol;

  return (
    <div
      className="fixed left-0 top-0 z-[100] w-full"
      style={{
        height: vvHeight != null ? `${vvHeight}px` : "100dvh",
        transform: `translateY(${vvOffsetTop}px)`,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* Backdrop — dim + blur, animates in/out with the bento. */}
      <div
        onClick={onClose}
        className="absolute inset-0 flex items-end justify-center"
        style={{
          background: visible ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
          backdropFilter: visible ? "blur(2px)" : "blur(0px)",
          WebkitBackdropFilter: visible ? "blur(2px)" : "blur(0px)",
          transition: visible
            ? "background 560ms ease, backdrop-filter 560ms ease"
            : "background 280ms ease, backdrop-filter 280ms ease",
          padding: "0 10px 18px",
        }}
      >
        {/* Bento card */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col bg-[var(--surface)] text-[var(--foreground)]"
          style={{
            maxHeight: "92%",
            borderRadius: 28,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
            transform: visible ? "translateY(0)" : "translateY(110%)",
            transition: "transform 560ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Drag handle */}
          <div className="flex shrink-0 justify-center pb-2 pt-1.5">
            <div className="h-1 w-9 rounded-full bg-black/[0.16]" />
          </div>

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between px-[18px] pb-2.5 pt-1">
            <span className="text-[15px] font-bold">Edit Category</span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          <form onSubmit={handleSave} className="flex min-h-0 flex-auto flex-col overflow-hidden">
            {/* Fixed top — live preview + name */}
            <div className="shrink-0 px-[18px]">
              <div className="mb-2.5 flex items-center gap-2.5 rounded-[20px] bg-[var(--background)] px-3 py-2.5 ring-1 ring-black/[0.06]">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${selectedColor}26` }}
                >
                  {currentSymbol ? (
                    <CategoryIcon
                      symbol={currentSymbol}
                      iconStyle={iconStyle}
                      size={18}
                      emojiSize="18px"
                      color={iconStyle === "2d" ? selectedColor : undefined}
                    />
                  ) : (
                    <span className="text-[18px] text-[var(--label-tertiary)]">?</span>
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[14px] font-semibold",
                    !name && "text-[var(--label-tertiary)]"
                  )}
                >
                  {name || "Category name"}
                </span>
              </div>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Category name"
                aria-label="Category name"
                className="h-11 w-full rounded-[16px] border border-[var(--separator)] bg-[var(--background)] px-4 text-[14.5px] text-[var(--foreground)] outline-none placeholder:text-[var(--label-tertiary)] focus:border-[var(--foreground)]/30"
              />
            </div>

            {/* Flexible middle — icon picker + colour. Fits with no scroll
                while the keyboard is down; scrolls only once a focused
                Name field shrinks the viewport. */}
            <div className="mt-2.5 flex min-h-0 flex-auto flex-col overflow-y-auto px-[18px]">
              {/* Icon mode toggle */}
              <div className="mb-2 flex shrink-0 gap-1 rounded-full bg-black/[0.05] p-1">
                {(["symbol", "emoji"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setIconMode(m);
                      // Switching to symbol mode while nothing is chosen
                      // (the category was on a free emoji) needs a default
                      // grid selection for the current icon style.
                      if (m === "symbol" && !selectedSymbol) setSelectedSymbol(firstSymbol);
                    }}
                    className={cn(
                      "min-h-[32px] flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-all",
                      iconMode === m
                        ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--label-secondary)]"
                    )}
                  >
                    {m === "emoji" ? "Custom" : iconStyle === "2d" ? "Icons" : "Symbols"}
                  </button>
                ))}
              </div>

              {iconMode === "emoji" ? (
                <input
                  type="text"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                  placeholder="Paste an emoji"
                  aria-label="Custom emoji"
                  className="h-11 w-full shrink-0 rounded-[14px] border border-[var(--separator)] bg-[var(--background)] px-4 text-center text-[18px] outline-none focus:border-[var(--foreground)]/30"
                />
              ) : (
                <div className="grid shrink-0 grid-cols-6 gap-1.5">
                  {iconStyle === "2d"
                    ? LUCIDE_PICKER.map(({ id, icon: Icon }) => {
                        const sym = makeLucideSymbol(id);
                        const active = selectedSymbol === sym;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedSymbol(sym)}
                            className="flex aspect-square items-center justify-center rounded-[14px] transition-transform active:scale-95"
                            style={{
                              border: active ? `1.5px solid ${selectedColor}` : "1px solid var(--separator)",
                              backgroundColor: active ? `${selectedColor}1f` : "var(--background)",
                            }}
                          >
                            <Icon
                              size={19}
                              strokeWidth={2}
                              style={{ color: active ? selectedColor : "var(--label-secondary)" }}
                            />
                          </button>
                        );
                      })
                    : SYMBOLS.map((s) => {
                        const active = selectedSymbol === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSelectedSymbol(s)}
                            className="flex aspect-square items-center justify-center rounded-[14px] text-[19px] transition-transform active:scale-95"
                            style={{
                              border: active ? `1.5px solid ${selectedColor}` : "1px solid var(--separator)",
                              backgroundColor: active ? `${selectedColor}1f` : "var(--background)",
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                </div>
              )}

              {/* Colour */}
              <p className="mb-1.5 mt-3 shrink-0 text-[12px] font-semibold text-[var(--label-secondary)]">
                Color
              </p>
              <div className="flex shrink-0 flex-wrap gap-2 pb-0.5">
                {SOFT_PALETTE.map((c) => {
                  const active = selectedColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      aria-label={`Color ${c}`}
                      className="h-8 w-8 rounded-full transition-transform"
                      style={{
                        backgroundColor: c,
                        transform: active ? "scale(1.12)" : "scale(1)",
                        boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : "none",
                      }}
                    />
                  );
                })}
              </div>

              {error && (
                <p className="mt-2.5 shrink-0 rounded-[12px] bg-rose-50 px-3.5 py-2 text-[12.5px] text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}
            </div>

            {/* Footer — save + two-tap delete */}
            <div className="shrink-0 space-y-2 px-[18px] pb-4 pt-3">
              <button
                type="submit"
                disabled={!canSave}
                className="flex h-12 w-full items-center justify-center rounded-[18px] bg-[var(--foreground)] text-[14.5px] font-semibold text-[var(--on-foreground)] transition-opacity disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || deleting}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 rounded-[16px] text-[14px] font-semibold transition-colors disabled:opacity-50",
                  confirmDelete ? "bg-rose-600 text-white" : "text-rose-600"
                )}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                {deleting
                  ? "Deleting…"
                  : confirmDelete
                  ? "Tap again to confirm"
                  : "Delete Category"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
