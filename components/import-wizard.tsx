"use client";

// RAM-26 — CSV bank import wizard.
//
// A 4-step bottom-sheet / modal:
//   1. Upload  — drag-target card; accepts .csv / .tsv / .txt
//   2. Map     — column mapping with bank presets (BCA, Mandiri, Jenius)
//   3. Preview — dedup table + AI-lite category suggestion
//   4. Done    — result count + "View transactions" link
//
// Parsing is done client-side (papaparse) to keep raw bank data off our
// servers. Only the final shaped ImportRow[] is sent to the server action.
//
// Native compatibility:
//   - PWA:             ✅ <input type="file"> works
//   - Android TWA:     ✅ File picker works
//   - iOS WKWebView:   ✅ File picker works (no File System Access API used)

import { useState, useRef } from "react";
import Papa from "papaparse";
import { X, Upload, ChevronLeft, Check, AlertCircle, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import { importTransactions, type ImportRow } from "@/app/actions/import";
import type { DbCategory, DbWallet } from "@/lib/types";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

type ParsedRow = Record<string, string>;

type BankPreset = {
  label: string;
  dateCol: string;
  amountCol: string;
  descCol: string;
  debitCreditSplit?: { debit: string; credit: string };
};

const BANK_PRESETS: Record<string, BankPreset> = {
  BCA: {
    label: "BCA",
    dateCol: "TANGGAL",
    amountCol: "JUMLAH",
    descCol: "KETERANGAN",
    debitCreditSplit: { debit: "DEBIT", credit: "KREDIT" },
  },
  Mandiri: {
    label: "Mandiri",
    dateCol: "Tanggal",
    amountCol: "Nominal",
    descCol: "Deskripsi",
  },
  Jenius: {
    label: "Jenius",
    dateCol: "Date",
    amountCol: "Amount",
    descCol: "Description",
  },
};

// ─── Simple category suggestion ───────────────────────────────────────────────

/** Returns a category_id from a simple keyword lookup. */
function suggestCategoryId(
  desc: string,
  categories: DbCategory[]
): string | null {
  const d = desc.toLowerCase();

  const rules: Array<{ keywords: string[]; nameHints: string[] }> = [
    { keywords: ["gojek", "grab", "ojek", "taxi", "bensin", "bbm", "parkir", "tol", "busway", "transjakarta", "mrt", "lrt", "kereta", "angkot"], nameHints: ["transport", "transportasi"] },
    { keywords: ["makan", "resto", "restoran", "food", "kafe", "cafe", "warung", "indomaret", "alfamart", "minuman", "drink", "lunch", "dinner", "breakfast", "snack"], nameHints: ["food", "makanan", "makan"] },
    { keywords: ["belanja", "shopee", "tokopedia", "lazada", "zalora", "toko", "shop", "market"], nameHints: ["shopping", "belanja"] },
    { keywords: ["listrik", "pln", "air", "pdam", "internet", "wifi", "telpon", "telepon", "phone", "electricity", "utility"], nameHints: ["utilities", "utilitas", "tagihan"] },
    { keywords: ["transfer", "tf", "top up", "topup", "isi saldo", "dompet"], nameHints: ["transfer"] },
    { keywords: ["gaji", "salary", "income", "pemasukan"], nameHints: ["salary", "gaji", "income", "pemasukan"] },
    { keywords: ["investasi", "saham", "reksadana", "crypto", "bitcoin"], nameHints: ["investment", "investasi"] },
    { keywords: ["kesehatan", "rumah sakit", "dokter", "apotik", "apotek", "obat", "hospital", "clinic", "health"], nameHints: ["health", "kesehatan"] },
    { keywords: ["sekolah", "kuliah", "kursus", "les", "pendidikan", "education"], nameHints: ["education", "pendidikan"] },
  ];

  for (const rule of rules) {
    const matchesKeyword = rule.keywords.some((k) => d.includes(k));
    if (matchesKeyword) {
      const cat = categories.find((c) =>
        rule.nameHints.some((h) => c.name.toLowerCase().includes(h))
      );
      if (cat) return cat.id;
    }
  }
  return null;
}

// ─── Dedup helper ─────────────────────────────────────────────────────────────

/** Marks rows as duplicates when existing transactions match within ±1 day + same amount + same description prefix. */
function markDuplicates(
  rows: PreviewRow[],
  existing: Array<{ date: string; amount: number; name: string }>
): PreviewRow[] {
  return rows.map((row) => {
    const rowDate = new Date(row.date).getTime();
    const isDup = existing.some((ex) => {
      const exDate = new Date(ex.date).getTime();
      const dayDiff = Math.abs(rowDate - exDate) / (1000 * 60 * 60 * 24);
      const amtMatch = Math.abs(ex.amount - row.amount) < 0.01;
      const nameMatch =
        ex.name.slice(0, 15).toLowerCase() === row.name.slice(0, 15).toLowerCase();
      return dayDiff <= 1 && amtMatch && nameMatch;
    });
    return { ...row, isDuplicate: isDup };
  });
}

// ─── Component types ──────────────────────────────────────────────────────────

type PreviewRow = {
  date: string;
  amount: number;
  name: string;
  type: "income" | "expense";
  category_id: string | null;
  isDuplicate: boolean;
  /** deterministic id derived from row index + content */
  rowKey: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  wallets: DbWallet[];
  categories: DbCategory[];
  /** Pass existing transactions for dedup (last 3 months is enough). */
  existingTransactions?: Array<{ date: string; amount: number; name: string }>;
};

// ─── Smart column detection ───────────────────────────────────────────────────

function detectColumn(headers: string[], patterns: string[]): string {
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (patterns.some((p) => hl.includes(p.toLowerCase()))) return h;
  }
  return headers[0] ?? "";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportWizard({
  open,
  onClose,
  wallets,
  categories,
  existingTransactions = [],
}: Props) {
  const t = useT();

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed CSV data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);

  // Column mapping
  const [dateCol, setDateCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [useDebitCredit, setUseDebitCredit] = useState(false);
  const [debitCol, setDebitCol] = useState("");
  const [creditCol, setCreditCol] = useState("");
  /** "auto" means positive = income, negative = expense */
  const [defaultType, setDefaultType] = useState<"expense" | "income" | "auto">("auto");

  // Wallet selection
  const [walletId, setWalletId] = useState(() => wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? "");

  // Preview rows
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  function resetAll() {
    setStep(1);
    setHeaders([]);
    setRawRows([]);
    setDateCol("");
    setAmountCol("");
    setDescCol("");
    setUseDebitCredit(false);
    setDebitCol("");
    setCreditCol("");
    setDefaultType("auto");
    setPreviewRows([]);
    setImporting(false);
    setImportError(null);
    setImportedCount(0);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  // ── File parsing ────────────────────────────────────────────────────────────

  function handleFile(file: File) {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const hs = result.meta.fields ?? [];
        setHeaders(hs);
        setRawRows(result.data);

        // Smart detection
        const d = detectColumn(hs, ["date", "tanggal", "tgl", "transaction date"]);
        const a = detectColumn(hs, ["amount", "jumlah", "nominal", "debit", "credit", "nilai"]);
        const de = detectColumn(hs, ["description", "keterangan", "uraian", "deskripsi", "memo", "narasi"]);
        setDateCol(d);
        setAmountCol(a);
        setDescCol(de);

        setStep(2);
      },
    });
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  // ── Bank preset ─────────────────────────────────────────────────────────────

  function applyPreset(key: string) {
    const p = BANK_PRESETS[key];
    if (!p) return;
    setDateCol(p.dateCol);
    if (p.debitCreditSplit) {
      setUseDebitCredit(true);
      setDebitCol(p.debitCreditSplit.debit);
      setCreditCol(p.debitCreditSplit.credit);
      setAmountCol("");
    } else {
      setUseDebitCredit(false);
      setAmountCol(p.amountCol);
    }
    setDescCol(p.descCol);
  }

  // ── Parse preview rows ───────────────────────────────────────────────────────

  function parseAmount(raw: string): number {
    if (!raw) return 0;
    // Handle Indonesian format: dots as thousands separator, comma as decimal
    const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    return Math.abs(parseFloat(cleaned) || 0);
  }

  function parseDate(raw: string): string {
    if (!raw) return new Date().toISOString().slice(0, 10);
    // Try various formats
    const trimmed = raw.trim();

    // ISO: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    // MM/DD/YYYY
    const mdy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (mdy) {
      const [, m, d, y] = mdy;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    // Fallback: try native Date parse
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  function buildPreviewRows(): PreviewRow[] {
    return rawRows.map((row, i) => {
      const date = parseDate(row[dateCol] ?? "");
      const name = (row[descCol] ?? "").trim() || "Imported transaction";

      let amount: number;
      let type: "income" | "expense";

      if (useDebitCredit) {
        const debitAmt = parseAmount(row[debitCol] ?? "");
        const creditAmt = parseAmount(row[creditCol] ?? "");
        // In Indonesian bank statements: debit = money out (expense), credit = money in (income)
        amount = debitAmt > 0 ? debitAmt : creditAmt;
        type = debitAmt > 0 ? "expense" : "income";
      } else {
        const rawAmt = row[amountCol] ?? "";
        const numericStr = rawAmt.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
        const parsed = parseFloat(numericStr) || 0;
        amount = Math.abs(parsed);

        if (defaultType === "auto") {
          type = parsed < 0 ? "expense" : "income";
          // If all amounts are positive and no sign info, default to expense
          if (parsed >= 0 && !rawAmt.includes("-")) type = "expense";
        } else {
          type = defaultType;
        }
      }

      const category_id = suggestCategoryId(name, categories);

      return {
        date,
        amount,
        name,
        type,
        category_id,
        isDuplicate: false,
        rowKey: `${i}-${date}-${amount}-${name}`,
      };
    });
  }

  function goToPreview() {
    const rows = buildPreviewRows();
    const deduped = markDuplicates(rows, existingTransactions);
    setPreviewRows(deduped);
    setStep(3);
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async function runImport() {
    const toImport = previewRows.filter((r) => !r.isDuplicate);
    if (!toImport.length) { setStep(4); setImportedCount(0); return; }

    setImporting(true);
    setImportError(null);

    const importRows: ImportRow[] = toImport.map((r) => ({
      date: r.date,
      amount: r.amount,
      name: r.name,
      type: r.type,
      category_id: r.category_id ?? null,
      wallet_id: walletId || null,
      // Stable deterministic id: base64url of "date|amount|name"
      client_op_id: btoa(`${r.date}|${r.amount}|${r.name}`).slice(0, 36),
    }));

    const result = await importTransactions(importRows, walletId);
    setImporting(false);

    if (result.error) {
      setImportError(result.error);
    } else {
      setImportedCount(result.inserted);
      setStep(4);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const newRows = previewRows.filter((r) => !r.isDuplicate);
  const dupRows = previewRows.filter((r) => r.isDuplicate);

  const STEPS: Array<"import.step.upload" | "import.step.map" | "import.step.preview" | "import.step.done"> = [
    "import.step.upload",
    "import.step.map",
    "import.step.preview",
    "import.step.done",
  ];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-[2px] animate-overlay-fade-in"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 rounded-t-3xl bg-[var(--background)] shadow-2xl max-h-[90vh] flex flex-col animate-sheet-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-black/[0.12]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            {step > 1 && step < 4 && (
              <button
                onClick={() => setStep((prev) => (prev - 1) as Step)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-[var(--foreground)] active:scale-90 transition-transform"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
            <h2 className="text-[17px] font-semibold text-[var(--foreground)]">
              {t("import.title")}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-[var(--foreground)] active:scale-90 transition-transform"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-5 pb-4 shrink-0">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-all",
                i + 1 <= step
                  ? "bg-[var(--foreground)]"
                  : "bg-black/[0.08]"
              )}
            />
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto pb-8">
          {step === 1 && (
            <StepUpload
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              onDrop={onDrop}
              fileInputRef={fileInputRef}
              hint={t("import.upload.hint")}
            />
          )}

          {step === 2 && (
            <StepMap
              headers={headers}
              rawRows={rawRows}
              dateCol={dateCol}
              setDateCol={setDateCol}
              amountCol={amountCol}
              setAmountCol={setAmountCol}
              descCol={descCol}
              setDescCol={setDescCol}
              useDebitCredit={useDebitCredit}
              setUseDebitCredit={setUseDebitCredit}
              debitCol={debitCol}
              setDebitCol={setDebitCol}
              creditCol={creditCol}
              setCreditCol={setCreditCol}
              defaultType={defaultType}
              setDefaultType={setDefaultType}
              wallets={wallets}
              walletId={walletId}
              setWalletId={setWalletId}
              applyPreset={applyPreset}
              onNext={goToPreview}
              t={t}
            />
          )}

          {step === 3 && (
            <StepPreview
              previewRows={previewRows}
              newCount={newRows.length}
              dupCount={dupRows.length}
              categories={categories}
              importing={importing}
              importError={importError}
              onImport={runImport}
              t={t}
            />
          )}

          {step === 4 && (
            <StepDone
              importedCount={importedCount}
              onClose={handleClose}
              onStartOver={() => { resetAll(); setStep(1); }}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="sr-only"
        onChange={onFileInput}
        aria-hidden="true"
      />
    </>
  );
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

function StepUpload({
  isDragging,
  setIsDragging,
  onDrop,
  fileInputRef,
  hint,
}: {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hint: string;
}) {
  return (
    <div className="px-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
          isDragging
            ? "border-[var(--foreground)] bg-[var(--foreground)]/[0.04]"
            : "border-black/[0.12] bg-[var(--surface)] hover:border-[var(--foreground)]/30"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.06]">
          <Upload className="h-7 w-7 text-[var(--label-secondary)]" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[var(--foreground)]">
            {isDragging ? "Drop file here" : "Choose or drag a file"}
          </p>
          <p className="mt-1 text-[13px] text-[var(--label-secondary)]">{hint}</p>
          <p className="mt-0.5 text-[12px] text-[var(--label-tertiary)]">.csv, .tsv, .txt</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Map Columns ──────────────────────────────────────────────────────

type StepMapProps = {
  headers: string[];
  rawRows: ParsedRow[];
  dateCol: string;
  setDateCol: (v: string) => void;
  amountCol: string;
  setAmountCol: (v: string) => void;
  descCol: string;
  setDescCol: (v: string) => void;
  useDebitCredit: boolean;
  setUseDebitCredit: (v: boolean) => void;
  debitCol: string;
  setDebitCol: (v: string) => void;
  creditCol: string;
  setCreditCol: (v: string) => void;
  defaultType: "expense" | "income" | "auto";
  setDefaultType: (v: "expense" | "income" | "auto") => void;
  wallets: DbWallet[];
  walletId: string;
  setWalletId: (v: string) => void;
  applyPreset: (key: string) => void;
  onNext: () => void;
  t: (key: Parameters<ReturnType<typeof useT>>[0]) => string;
};

function StepMap({
  headers, rawRows,
  dateCol, setDateCol,
  amountCol, setAmountCol,
  descCol, setDescCol,
  useDebitCredit, setUseDebitCredit,
  debitCol, setDebitCol,
  creditCol, setCreditCol,
  defaultType, setDefaultType,
  wallets, walletId, setWalletId,
  applyPreset, onNext, t,
}: StepMapProps) {
  const previewRowData = rawRows.slice(0, 3);

  const canProceed = dateCol && descCol && (useDebitCredit ? (debitCol && creditCol) : amountCol);

  return (
    <div className="px-5 space-y-5">
      {/* Bank presets */}
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("import.preset")}
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(BANK_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--foreground)] ring-1 ring-black/[0.08] active:scale-90 transition-transform"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* CSV preview */}
      {previewRowData.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-black/[0.06]">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[var(--separator)]">
                  {headers.slice(0, 6).map((h) => (
                    <th key={h} className="px-2.5 py-2 text-left font-semibold text-[var(--label-tertiary)] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRowData.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--separator)] last:border-0">
                    {headers.slice(0, 6).map((h) => (
                      <td key={h} className="px-2.5 py-1.5 text-[var(--label-secondary)] whitespace-nowrap max-w-[90px] truncate">
                        {row[h] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column selectors */}
      <div className="space-y-3">
        <ColSelect label={t("import.columnDate")} value={dateCol} headers={headers} onChange={setDateCol} />
        <ColSelect label={t("import.columnDesc")} value={descCol} headers={headers} onChange={setDescCol} />

        {/* Debit/credit toggle */}
        <div className="flex items-center justify-between rounded-xl bg-[var(--surface)] px-3.5 py-3 ring-1 ring-black/[0.06]">
          <p className="text-[14px] font-medium text-[var(--foreground)]">{t("import.debitCredit")}</p>
          <button
            onClick={() => setUseDebitCredit(!useDebitCredit)}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              useDebitCredit ? "bg-[var(--foreground)]" : "bg-black/[0.12]"
            )}
          >
            <span className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              useDebitCredit ? "translate-x-5.5" : "translate-x-0.5"
            )} />
          </button>
        </div>

        {useDebitCredit ? (
          <>
            <ColSelect label={t("import.columnDebit")} value={debitCol} headers={headers} onChange={setDebitCol} />
            <ColSelect label={t("import.columnCredit")} value={creditCol} headers={headers} onChange={setCreditCol} />
          </>
        ) : (
          <>
            <ColSelect label={t("import.columnAmount")} value={amountCol} headers={headers} onChange={setAmountCol} />
            {/* Default type */}
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
                {t("import.typeLabel")}
              </p>
              <div className="flex gap-2">
                {(["auto", "expense", "income"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDefaultType(opt)}
                    className={cn(
                      "flex-1 rounded-xl py-2 text-[13px] font-medium transition-all ring-1",
                      defaultType === opt
                        ? "bg-[var(--foreground)] text-[var(--on-foreground)] ring-[var(--foreground)]"
                        : "bg-[var(--surface)] text-[var(--foreground)] ring-black/[0.08]"
                    )}
                  >
                    {opt === "auto" ? t("import.autoDetect") : opt === "expense" ? t("import.typeExpense") : t("import.typeIncome")}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Wallet */}
      {wallets.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
            {t("import.walletLabel")}
          </p>
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="w-full rounded-xl bg-[var(--surface)] px-3.5 py-3 text-[14px] text-[var(--foreground)] outline-none ring-1 ring-black/[0.08]"
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Next button */}
      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full h-12 rounded-2xl bg-[var(--foreground)] text-[15px] font-semibold text-[var(--on-foreground)] disabled:opacity-40"
      >
        {t("import.step.preview")} →
      </button>
    </div>
  );
}

function ColSelect({
  label, value, headers, onChange,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-[var(--surface)] px-3.5 py-3 text-[14px] text-[var(--foreground)] outline-none ring-1 ring-black/[0.08]"
      >
        <option value="">— select column —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Step 3: Preview ──────────────────────────────────────────────────────────

function StepPreview({
  previewRows,
  newCount,
  dupCount,
  categories,
  importing,
  importError,
  onImport,
  t,
}: {
  previewRows: PreviewRow[];
  newCount: number;
  dupCount: number;
  categories: DbCategory[];
  importing: boolean;
  importError: string | null;
  onImport: () => void;
  t: (key: Parameters<ReturnType<typeof useT>>[0]) => string;
}) {
  const getCategoryName = (id: string | null) => {
    if (!id) return "";
    return categories.find((c) => c.id === id)?.name ?? "";
  };

  return (
    <div className="px-5 space-y-4">
      {/* Summary chips */}
      <div className="flex gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-700">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          {t("import.summaryNew").replace("{n}", String(newCount))}
        </div>
        {dupCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[13px] font-medium text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("import.summarySkipped").replace("{y}", String(dupCount))}
          </div>
        )}
      </div>

      {/* Preview table */}
      <div className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-black/[0.06]">
        <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[var(--surface)] z-10">
              <tr className="border-b border-[var(--separator)]">
                <th className="px-3 py-2 text-left font-semibold text-[var(--label-tertiary)]">Date</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--label-tertiary)]">Amount</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--label-tertiary)]">Description</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--label-tertiary)]">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--label-tertiary)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr
                  key={row.rowKey}
                  className={cn(
                    "border-b border-[var(--separator)] last:border-0 transition-opacity",
                    row.isDuplicate && "opacity-50"
                  )}
                >
                  <td className="px-3 py-2 text-[var(--foreground)] whitespace-nowrap">{row.date}</td>
                  <td className={cn(
                    "px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap",
                    row.type === "income" ? "text-emerald-600" : "text-[var(--foreground)]"
                  )}>
                    {row.type === "income" ? "+" : "-"}{row.amount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-[var(--label-secondary)] max-w-[120px] truncate">{row.name}</td>
                  <td className="px-3 py-2 text-[var(--label-secondary)] max-w-[80px] truncate">
                    {getCategoryName(row.category_id)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      row.isDuplicate
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    )}>
                      {row.isDuplicate ? t("import.duplicate") : t("import.new")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error */}
      {importError && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
          <p>{importError}</p>
        </div>
      )}

      {/* Import button */}
      <button
        onClick={onImport}
        disabled={importing || newCount === 0}
        className="w-full h-12 rounded-2xl bg-[var(--foreground)] text-[15px] font-semibold text-[var(--on-foreground)] disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {importing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("import.importing")}
          </>
        ) : (
          `${t("import.importing").replace("...", "")} ${newCount} →`
        )}
      </button>
    </div>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone({
  importedCount,
  onClose,
  onStartOver,
  t,
}: {
  importedCount: number;
  onClose: () => void;
  onStartOver: () => void;
  t: (key: Parameters<ReturnType<typeof useT>>[0]) => string;
}) {
  return (
    <div className="px-5 flex flex-col items-center gap-5 pt-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
        <Check className="h-10 w-10 text-emerald-600" strokeWidth={2} />
      </div>

      <div className="text-center">
        <p className="text-[22px] font-bold text-[var(--foreground)]">
          {t("import.result").replace("{n}", String(importedCount))}
        </p>
      </div>

      <div className="w-full space-y-2">
        <Link
          href="/transactions"
          onClick={onClose}
          className="flex w-full h-12 items-center justify-center rounded-2xl bg-[var(--foreground)] text-[15px] font-semibold text-[var(--on-foreground)]"
        >
          {t("import.viewTransactions")}
        </Link>
        <button
          onClick={onStartOver}
          className="w-full h-12 rounded-2xl bg-[var(--surface)] text-[15px] font-medium text-[var(--foreground)] ring-1 ring-black/[0.06]"
        >
          {t("import.startOver")}
        </button>
      </div>
    </div>
  );
}
