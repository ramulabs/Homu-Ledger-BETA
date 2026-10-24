"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Delete, History } from "lucide-react";
import { calculate, calculationText, calculatorKey, type CalculatorState } from "@/lib/calculator";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

type Props = {
  state: CalculatorState;
  onChange: (update: (previous: CalculatorState) => CalculatorState) => void;
  onApply: () => void;
  onClose: () => void;
};

const KEYS = ["C", "Backspace", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="];

export default function TransactionCalculator({ state, onChange, onApply, onClose }: Props) {
  const tr = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const calculation = calculate(state.expression);
  const canApply = !calculation.error && Number(calculationText(calculation.value)) > 0;
  const error = calculation.error === "divideByZero" ? tr("calculator.divideByZero")
    : calculation.error === "tooLarge" ? tr("calculator.tooLarge")
    : calculation.error === "invalid" ? tr("calculator.invalid")
    : !calculation.error && !canApply ? tr("calculator.positiveAmount") : null;

  useEffect(() => { panelRef.current?.focus(); }, []);

  function press(key: string) { onChange((previous) => calculatorKey(previous, key)); }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label={tr("calculator.title")}
      className="flex min-h-0 flex-col overflow-y-auto outline-none"
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        // Focused buttons keep their native Enter/Space activation.
        if (event.target !== event.currentTarget && (event.key === "Enter" || event.key === " ")) return;
        const key = ({ "*": "×", "/": "÷", "-": "−", ",": ".", Enter: "=", Delete: "C", c: "C" } as Record<string, string>)[event.key] ?? event.key;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
        else if (KEYS.includes(key)) { event.preventDefault(); event.stopPropagation(); press(key); }
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-5 pb-1">
        <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-[var(--label-secondary)]">
          <ArrowLeft className="h-4 w-4" />{tr("calculator.back")}
        </button>
        <button type="button" aria-label={tr("calculator.history")} aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--label-secondary)] hover:bg-black/5">
          <History className="h-[18px] w-[18px]" />
        </button>
      </div>
      {showHistory && (
        <div className="mx-5 mb-2 max-h-24 shrink-0 overflow-y-auto rounded-2xl bg-[var(--background)] p-2" aria-label={tr("calculator.history")}>
          {state.history.length ? state.history.map((entry, index) => (
            <button type="button" key={`${index}-${entry.expression}`} onClick={() => { onChange((previous) => ({ ...previous, expression: entry.expression, evaluated: false })); setShowHistory(false); panelRef.current?.focus(); }} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-2 text-left text-sm hover:bg-black/5">
              <span className="truncate text-[var(--label-secondary)]">{entry.expression}</span>
              <span className="shrink-0 font-semibold tabular-nums">= {entry.result.replace(".", ",")}</span>
            </button>
          )) : <p className="px-2 py-3 text-[13px] text-[var(--label-tertiary)]">{tr("calculator.emptyHistory")}</p>}
        </div>
      )}
      <div className="mx-5 mb-3 shrink-0 rounded-2xl bg-[var(--background)] px-4 py-2.5">
        <div role="status" aria-label={tr("calculator.expression")} className="overflow-x-auto whitespace-nowrap text-right text-lg font-medium tabular-nums text-[var(--foreground)]">{state.expression || "0"}</div>
        <p aria-live="polite" className={cn("mt-1 min-h-4 text-right text-[11px]", error ? "text-rose-600" : "text-[var(--label-tertiary)]")}>
          {error ?? tr("calculator.percentHint")}
        </p>
      </div>
      <div className="grid shrink-0 grid-cols-4 gap-2 px-3">
        {KEYS.map((key) => (
          <button
            type="button"
            key={key}
            aria-label={key === "Backspace" ? tr("calculator.backspace") : key === "C" ? tr("calculator.clear") : key === "=" ? tr("calculator.equals") : key}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => press(key)}
            className={cn("flex h-11 items-center justify-center rounded-2xl text-[22px] font-semibold ring-1 ring-black/[0.04] transition-colors active:brightness-95 [touch-action:manipulation]", key === "0" && "col-span-2", key === "=" ? "bg-[#EE6452] text-white" : ["+", "−", "×", "÷"].includes(key) ? "bg-[#EE6452]/10 text-[#EE6452]" : "bg-[var(--background)] text-[var(--foreground)]")}
          >
            {key === "Backspace" ? <Delete className="h-5 w-5" /> : key === "." ? "," : key}
          </button>
        ))}
      </div>
      <div className="shrink-0 px-3 pt-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <button type="button" onClick={onApply} disabled={!canApply} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#EE6452] text-[14px] font-semibold text-white transition-opacity disabled:opacity-40">
          <Check className="h-4 w-4" strokeWidth={2.5} />{tr("calculator.apply")}
        </button>
      </div>
    </div>
  );
}
