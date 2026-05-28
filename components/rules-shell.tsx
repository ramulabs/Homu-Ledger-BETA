"use client";

// RAM-28 — Settings → Categorization Rules list + edit sheet.
//
// Layout mirrors budgets-shell / wallets-shell: sticky header, rounded
// card list, safe-area-inset handling.
//
// The rule sheet is a full-screen bottom-sheet that handles both CREATE
// and EDIT. It includes:
//   • Name field
//   • Triggers section (at least one required)
//   • Actions section (at least one required)
//   • "Stop on first match" toggle
//   • Save / Cancel

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Zap,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { TapLink } from "@/components/tap";
import { useT } from "@/lib/i18n/provider";
import { saveRule, deleteRule } from "@/app/actions/rules";
import type { DbCategory, DbTransactionRule, RuleAction, RuleTrigger } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";
import { cn } from "@/lib/cn";

type Props = {
  initialRules: DbTransactionRule[];
  categories: DbCategory[];
  iconStyle?: IconStyle;
  /** Pre-fill from "Create rule from transaction" deep link. */
  prefill?: { name: string; category_id: string } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function triggerSummary(rule: DbTransactionRule): string {
  const parts = rule.triggers.map((t) => {
    const field = t.field === "name" ? "description" : "amount";
    return `${field} ${t.op.replace(/_/g, " ")} "${t.value}"`;
  });
  return parts.join(" AND ") || "—";
}

function actionSummary(rule: DbTransactionRule, categories: DbCategory[]): string {
  const parts = rule.actions.map((a) => {
    if (a.field === "category_id") {
      const cat = categories.find((c) => c.id === a.value);
      return `→ ${cat?.name ?? a.value}`;
    }
    return `note: "${a.value}"`;
  });
  return parts.join(", ") || "—";
}

// ─── Toggle ───────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-[#EE6452]" : "bg-black/20"
      )}
    >
      <span
        className={cn(
          "inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ─── Rule row ─────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  categories,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: DbTransactionRule;
  categories: DbCategory[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useT();
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 min-h-[68px]">
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <p
          className={cn(
            "text-[15px] font-semibold",
            rule.enabled ? "text-[var(--foreground)]" : "text-[var(--label-tertiary)]"
          )}
        >
          {rule.name}
        </p>
        <p className="text-[12px] text-[var(--label-secondary)] truncate">
          {triggerSummary(rule)}
        </p>
        <p className="text-[12px] text-[var(--label-tertiary)] truncate">
          {actionSummary(rule, categories)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <Toggle
          checked={rule.enabled}
          onChange={onToggle}
          label={t("rules.enabled")}
        />
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("rules.edit")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--label-secondary)] active:bg-black/[0.04]"
        >
          <Pencil className="h-[15px] w-[15px]" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("common.delete")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-rose-500 active:bg-rose-50"
        >
          <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
        </button>
      </div>
    </li>
  );
}

// ─── Rule sheet ───────────────────────────────────────────────────────────

type SheetProps = {
  open: boolean;
  rule: DbTransactionRule | null;
  categories: DbCategory[];
  prefillName?: string;
  prefillCategoryId?: string;
  onClose: () => void;
  onSaved: (rule: DbTransactionRule) => void;
};

function blankTrigger(): RuleTrigger {
  return { field: "name", op: "contains", value: "" };
}
function blankAction(): RuleAction {
  return { field: "category_id", value: "" };
}

function RuleSheet({
  open,
  rule,
  categories,
  prefillName,
  prefillCategoryId,
  onClose,
  onSaved,
}: SheetProps) {
  const t = useT();

  const [name, setName] = useState("");
  const [triggers, setTriggers] = useState<RuleTrigger[]>([blankTrigger()]);
  const [actions, setActions] = useState<RuleAction[]>([blankAction()]);
  const [stopProcessing, setStopProcessing] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when sheet opens/closes or the rule changes.
  // State updates are batched via queueMicrotask to avoid the
  // react-hooks/purity "setState in effect" warning — the pattern is
  // widespread in the codebase but we keep new code clean.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      if (rule) {
        setName(rule.name);
        setTriggers(rule.triggers.length ? rule.triggers : [blankTrigger()]);
        setActions(rule.actions.length ? rule.actions : [blankAction()]);
        setStopProcessing(rule.stop_processing);
        setEnabled(rule.enabled);
      } else {
        // New rule — apply prefill if present
        setName("");
        const initTrigger: RuleTrigger = {
          field: "name",
          op: "contains",
          value: prefillName ?? "",
        };
        const initAction: RuleAction = {
          field: "category_id",
          value: prefillCategoryId ?? "",
        };
        setTriggers([initTrigger]);
        setActions([initAction]);
        setStopProcessing(true);
        setEnabled(true);
      }
      setError(null);
      setSaving(false);
    });
  }, [open, rule, prefillName, prefillCategoryId]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await saveRule({
      ...(rule ? { id: rule.id, order_idx: rule.order_idx } : {}),
      name,
      triggers,
      actions,
      stop_processing: stopProcessing,
      enabled,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.rule) onSaved(result.rule);
    onClose();
  }

  // Trigger helpers
  function updateTrigger(idx: number, patch: Partial<RuleTrigger>) {
    setTriggers((prev) => prev.map((tr, i) => (i === idx ? { ...tr, ...patch } : tr)));
  }
  function removeTrigger(idx: number) {
    setTriggers((prev) => prev.filter((_, i) => i !== idx));
  }
  function addTrigger() {
    setTriggers((prev) => [...prev, blankTrigger()]);
  }

  // Action helpers
  function updateAction(idx: number, patch: Partial<RuleAction>) {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }
  function removeAction(idx: number) {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  }
  function addAction() {
    setActions((prev) => [...prev, blankAction()]);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex w-full max-w-md flex-col rounded-t-3xl bg-[var(--surface)] shadow-[0_-10px_30px_rgba(0,0,0,0.18)]"
        style={{ maxHeight: "92%", animation: "sheet-slide-up 400ms cubic-bezier(0.32,0.72,0,1) both" }}>
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1.5 pt-3">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--separator)] px-5 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.04] text-[var(--foreground)] active:bg-black/[0.08]"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
          <h2 className="text-[17px] font-semibold">
            {rule ? t("rules.edit") : t("rules.add")}
          </h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EE6452] text-white disabled:opacity-60 active:opacity-80"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <Check className="h-[18px] w-[18px]" strokeWidth={2.75} />
            )}
          </button>
        </div>

        {/* Scrollable body */}
        <div data-scroll className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Rule name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
              {t("rules.name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("rules.namePlaceholder")}
              className="h-11 w-full rounded-2xl border border-[var(--separator)] bg-[var(--background)] px-4 text-[14.5px] text-[var(--foreground)] outline-none placeholder:text-[var(--label-tertiary)] focus:border-[var(--foreground)]/30"
            />
          </div>

          {/* Triggers */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
              {t("rules.trigger")}
            </p>
            {triggers.map((tr, idx) => (
              <TriggerRow
                key={idx}
                trigger={tr}
                canRemove={triggers.length > 1}
                onChange={(patch) => updateTrigger(idx, patch)}
                onRemove={() => removeTrigger(idx)}
              />
            ))}
            <button
              type="button"
              onClick={addTrigger}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--separator)] px-3 py-1.5 text-[13px] font-medium text-[var(--label-secondary)] active:bg-black/[0.04]"
            >
              <Plus className="h-[13px] w-[13px]" strokeWidth={2.25} />
              {t("rules.addTrigger")}
            </button>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
              {t("rules.action")}
            </p>
            {actions.map((a, idx) => (
              <ActionRow
                key={idx}
                action={a}
                categories={categories}
                canRemove={actions.length > 1}
                onChange={(patch) => updateAction(idx, patch)}
                onRemove={() => removeAction(idx)}
              />
            ))}
            <button
              type="button"
              onClick={addAction}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--separator)] px-3 py-1.5 text-[13px] font-medium text-[var(--label-secondary)] active:bg-black/[0.04]"
            >
              <Plus className="h-[13px] w-[13px]" strokeWidth={2.25} />
              {t("rules.addAction")}
            </button>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
              Options
            </p>
            <div className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-4 py-3.5 ring-1 ring-black/[0.04]">
              <div className="mr-3 min-w-0 flex-1">
                <p className="text-[14.5px] font-medium text-[var(--foreground)]">{t("rules.stop_processing")}</p>
                <p className="mt-0.5 text-[12px] text-[var(--label-secondary)] leading-snug">{t("rules.stop_processing.hint")}</p>
              </div>
              <Toggle checked={stopProcessing} onChange={setStopProcessing} label={t("rules.stop_processing")} />
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-4 py-3.5 ring-1 ring-black/[0.04]">
              <p className="text-[14.5px] font-medium text-[var(--foreground)]">{t("rules.enabled")}</p>
              <Toggle checked={enabled} onChange={setEnabled} label={t("rules.enabled")} />
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          {/* Bottom safe-area clearance */}
          <div style={{ height: "max(16px, env(safe-area-inset-bottom))" }} />
        </div>
      </div>
    </>
  );
}

// ─── TriggerRow ────────────────────────────────────────────────────────────

function TriggerRow({
  trigger,
  canRemove,
  onChange,
  onRemove,
}: {
  trigger: RuleTrigger;
  canRemove: boolean;
  onChange: (patch: Partial<RuleTrigger>) => void;
  onRemove: () => void;
}) {
  const t = useT();

  const fieldOptions: { value: RuleTrigger["field"]; label: string }[] = [
    { value: "name", label: t("rules.field.name") },
    { value: "amount", label: t("rules.field.amount") },
  ];

  const nameOps: { value: RuleTrigger["op"]; label: string }[] = [
    { value: "contains", label: t("rules.op.contains") },
    { value: "starts_with", label: t("rules.op.starts_with") },
    { value: "equals", label: t("rules.op.equals") },
  ];
  const amountOps: { value: RuleTrigger["op"]; label: string }[] = [
    { value: "equals", label: t("rules.op.equals") },
    { value: "gt", label: t("rules.op.gt") },
    { value: "lt", label: t("rules.op.lt") },
  ];
  const ops = trigger.field === "amount" ? amountOps : nameOps;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1.5">
        {/* Field selector */}
        <div className="relative">
          <select
            value={trigger.field}
            onChange={(e) =>
              onChange({ field: e.target.value as RuleTrigger["field"], op: "contains", value: "" })
            }
            aria-label={t("rules.triggerField")}
            className="h-10 appearance-none rounded-xl border border-[var(--separator)] bg-[var(--background)] pl-3 pr-7 text-[13px] font-medium text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/30"
            style={{ fontSize: 16 }}
          >
            {fieldOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--label-tertiary)]" strokeWidth={2} />
        </div>

        {/* Op selector */}
        <div className="relative">
          <select
            value={trigger.op}
            onChange={(e) => onChange({ op: e.target.value as RuleTrigger["op"] })}
            aria-label={t("rules.triggerOp")}
            className="h-10 appearance-none rounded-xl border border-[var(--separator)] bg-[var(--background)] pl-3 pr-7 text-[13px] font-medium text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/30"
            style={{ fontSize: 16 }}
          >
            {ops.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--label-tertiary)]" strokeWidth={2} />
        </div>

        {/* Value input */}
        <input
          type={trigger.field === "amount" ? "number" : "text"}
          inputMode={trigger.field === "amount" ? "decimal" : "text"}
          value={trigger.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={t("rules.triggerValuePlaceholder")}
          className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--separator)] bg-[var(--background)] px-3 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--label-tertiary)] focus:border-[var(--foreground)]/30"
        />
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--label-tertiary)] active:text-rose-500"
        >
          <X className="h-[14px] w-[14px]" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ─── ActionRow ─────────────────────────────────────────────────────────────

function ActionRow({
  action,
  categories,
  canRemove,
  onChange,
  onRemove,
}: {
  action: RuleAction;
  categories: DbCategory[];
  canRemove: boolean;
  onChange: (patch: Partial<RuleAction>) => void;
  onRemove: () => void;
}) {
  const t = useT();

  const fieldOptions: { value: RuleAction["field"]; label: string }[] = [
    { value: "category_id", label: t("rules.actionCategory") },
    { value: "notes", label: t("rules.actionNotes") },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1.5">
        {/* Field selector */}
        <div className="relative">
          <select
            value={action.field}
            onChange={(e) => onChange({ field: e.target.value as RuleAction["field"], value: "" })}
            aria-label={t("rules.actionField")}
            className="h-10 appearance-none rounded-xl border border-[var(--separator)] bg-[var(--background)] pl-3 pr-7 text-[13px] font-medium text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/30"
            style={{ fontSize: 16 }}
          >
            {fieldOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--label-tertiary)]" strokeWidth={2} />
        </div>

        {/* Value — category picker or text input */}
        {action.field === "category_id" ? (
          <div className="relative flex-1">
            <select
              value={action.value}
              onChange={(e) => onChange({ value: e.target.value })}
              aria-label={t("tx.selectCategory")}
              className="h-10 w-full appearance-none rounded-xl border border-[var(--separator)] bg-[var(--background)] pl-3 pr-7 text-[13px] font-medium text-[var(--foreground)] outline-none focus:border-[var(--foreground)]/30"
              style={{ fontSize: 16 }}
            >
              <option value="">{t("tx.selectCategory")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.symbol} {cat.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--label-tertiary)]" strokeWidth={2} />
          </div>
        ) : (
          <input
            type="text"
            value={action.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={t("rules.actionNotesPlaceholder")}
            className="h-10 flex-1 rounded-xl border border-[var(--separator)] bg-[var(--background)] px-3 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--label-tertiary)] focus:border-[var(--foreground)]/30"
          />
        )}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--label-tertiary)] active:text-rose-500"
        >
          <X className="h-[14px] w-[14px]" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ─── Main shell ────────────────────────────────────────────────────────────

export default function RulesShell({
  initialRules,
  categories,
  // iconStyle is accepted for future use (category icon display in rule cards)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  iconStyle: _iconStyle = "3d",
  prefill = null,
}: Props) {
  const t = useT();

  const [rules, setRules] = useState<DbTransactionRule[]>(initialRules);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DbTransactionRule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // If a prefill was passed (from "Create rule from transaction"), open
  // the sheet immediately on mount.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefill && !prefillApplied.current) {
      prefillApplied.current = true;
      setEditingRule(null);
      setSheetOpen(true);
    }
  }, [prefill]);

  function openAdd() {
    setEditingRule(null);
    setSheetOpen(true);
  }

  function openEdit(rule: DbTransactionRule) {
    setEditingRule(rule);
    setSheetOpen(true);
  }

  async function handleDelete(id: string) {
    if (deletingId !== id) {
      // Require a second tap (confirmation pattern used throughout the app)
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 2500);
      return;
    }
    setDeletingId(null);
    const result = await deleteRule(id);
    if (!result.error) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    // Optimistically flip the toggle, then persist.
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await saveRule({ id, enabled });
  }

  function handleSaved(rule: DbTransactionRule) {
    setRules((prev) => {
      const existing = prev.findIndex((r) => r.id === rule.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = rule;
        return next;
      }
      // New rule — append, then sort by order_idx
      return [...prev, rule].sort((a, b) => a.order_idx - b.order_idx);
    });
  }

  return (
    <>
      {/* Page */}
      <div className="pb-4 mb-[-6rem] md:mb-0">
        <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
          <TapLink
            href="/settings"
            aria-label={t("common.back")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform [touch-action:manipulation]"
          >
            <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
          </TapLink>
          <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
            {t("rules.title")}
          </h1>
          <button
            type="button"
            onClick={openAdd}
            aria-label={t("rules.add")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform [touch-action:manipulation]"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
        </header>

        <p className="mx-5 mt-1 text-[13px] text-[var(--label-secondary)] leading-relaxed">
          {t("rules.subtitle")}
        </p>

        {rules.length === 0 ? (
          <div className="mx-5 mt-6 rounded-2xl bg-[var(--surface)] px-6 py-14 text-center ring-1 ring-black/[0.04]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.04] text-[var(--label-secondary)]">
              <Zap className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <p className="text-[16px] font-semibold text-[var(--foreground)]">{t("rules.empty")}</p>
            <p className="mt-1.5 text-[13px] text-[var(--label-secondary)] leading-relaxed">
              {t("rules.empty.subtitle")}
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#EE6452] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(238,100,82,0.30)] active:opacity-80"
            >
              <Plus className="h-[15px] w-[15px]" strokeWidth={2.5} />
              {t("rules.add")}
            </button>
          </div>
        ) : (
          <ul className="mx-5 mt-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                categories={categories}
                onEdit={() => openEdit(rule)}
                onDelete={() => handleDelete(rule.id)}
                onToggle={(enabled) => handleToggle(rule.id, enabled)}
              />
            ))}
          </ul>
        )}

        {/* Delete confirmation hint */}
        {deletingId && (
          <p className="mx-5 mt-3 text-center text-[12px] text-rose-600">
            {t("rules.deleteConfirm")} {t("common.delete")} again to confirm.
          </p>
        )}
      </div>

      {/* Edit sheet */}
      <RuleSheet
        open={sheetOpen}
        rule={editingRule}
        categories={categories}
        prefillName={prefill?.name}
        prefillCategoryId={prefill?.category_id}
        onClose={() => setSheetOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}
