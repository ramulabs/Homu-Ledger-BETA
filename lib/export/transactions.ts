// Transaction export — pure builders for CSV and PDF (RAM-10).
//
// Server-only. Both builders take a fully resolved set of rows + lookup
// maps (categories, wallets, members) and return a Uint8Array, so they
// can be wrapped by the /api/export/transactions route handler OR by a
// future Capacitor-side native generator (the inputs are JSON-safe).
//
// Why this file exists separate from the route handler:
//  - The route handler is the web delivery seam. If we later ship a
//    Capacitor build that wants to write the file with @capacitor/filesystem
//    instead of a download response, it can call buildCsv / buildPdf
//    directly and skip the HTTP layer entirely.
//  - Keeps the route handler thin and easy to read — auth, query, hand off.
//  - Keeps the data shape decisions (columns, headers) in one place so the
//    CSV and PDF stay consistent.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatAmount } from "@/lib/format";
import type { TKey, Lang } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/dictionaries";

// ── Shape of a row passed to the builders ───────────────────────────────────
// Mirrors the columns we select from `transactions` plus resolved label
// strings for category / wallet / member. Resolution happens in the route
// handler so the builders stay pure (no Supabase coupling).
export type ExportRow = {
  date: string;        // YYYY-MM-DD
  type: "income" | "expense";
  amount: number;      // positive number; sign is implied by `type`
  description: string;
  category: string;    // resolved label, "Uncategorized" if missing
  wallet: string;      // resolved label, "—" if missing
  member: string;      // resolved label, "—" if missing
  note: string;        // free text, may be empty
};

export type ExportMeta = {
  ledgerName: string;
  currency: string;
  start: string;       // YYYY-MM-DD
  end: string;         // YYYY-MM-DD
  generatedAt: string; // ISO
  lang: Lang;
};

// ── Filename helper ─────────────────────────────────────────────────────────
// Shared between the route handler (Content-Disposition) and the client
// shell (download attribute) so the two always match. YYYYMMDD form keeps
// it filesystem-safe and sortable; per the spec.
export function exportFilename(format: "csv" | "pdf", meta: Pick<ExportMeta, "start" | "end">): string {
  const compact = (d: string) => d.replace(/-/g, "");
  return `homu-transactions-${compact(meta.start)}-${compact(meta.end)}.${format}`;
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// UTF-8 with BOM so Excel for Windows correctly detects encoding and
// renders Indonesian / accented characters. Numbers (count, dau, etc.)
// are emitted as bare integers; amounts are emitted as fixed-point with
// the currency code in a separate column so spreadsheets can SUM() them.
// Sign convention: amount is always positive; the `Type` column carries
// income/expense, which is the canonical pattern accountants expect.

const BOM = "﻿";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows: ExportRow[], meta: ExportMeta): Uint8Array {
  const t = getT(meta.lang);
  const header = [
    t("export.col.date"),
    t("export.col.type"),
    t("export.col.amount"),
    t("export.col.currency"),
    t("export.col.description"),
    t("export.col.category"),
    t("export.col.wallet"),
    t("export.col.member"),
    t("export.col.note"),
  ];

  const lines: string[] = [];
  lines.push(header.map(csvCell).join(","));
  for (const r of rows) {
    lines.push(
      [
        r.date,
        // Localised "Income" / "Expense" label so opening the CSV in a
        // locale-appropriate spreadsheet doesn't require translation.
        r.type === "income" ? t("reports.income") : t("reports.expenses"),
        // Fixed-point with 2 decimal places — IDR is integer-valued so
        // this gives "1500000.00", which SUM() handles without locale
        // games. Anyone wanting display formatting can format the cell.
        r.amount.toFixed(2),
        meta.currency,
        r.description,
        r.category,
        r.wallet,
        r.member,
        r.note,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  // CRLF line endings match the RFC 4180 spec and Excel-on-Windows
  // expectation; macOS / LF-only tools are tolerant of CRLF.
  const text = BOM + lines.join("\r\n") + "\r\n";
  return new TextEncoder().encode(text);
}

// ── PDF ─────────────────────────────────────────────────────────────────────
// Single-pass layout, A4 portrait, ~50 rows per page. Header carries the
// ledger name + date range, footer carries page numbers and a totals
// summary at the end. Standard Helvetica only — pdf-lib's StandardFonts
// avoid font-file shipping AND have predictable widths everywhere, which
// matters because we don't have full text-shaping for the table.
//
// Why pdf-lib over jspdf: pdf-lib is built on the Web Crypto API and runs
// in any modern runtime (including Vercel's edge / nodejs serverless),
// returns Uint8Array directly, and has zero native deps. jspdf bundles a
// canvas polyfill and a much larger surface area for what we need (no
// drawing of paths, no images). pdf-lib also produces smaller files for
// pure-text layouts.

const PAGE_W = 595.28; // A4 width in points
const PAGE_H = 841.89; // A4 height in points
const MARGIN_X = 40;
const MARGIN_Y = 40;
const ROW_H = 16;
const FONT_SIZE_BODY = 9;
const FONT_SIZE_HEAD = 9.5;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_META = 10;

type Col = { key: keyof ExportRow | "_signedAmount"; labelKey: TKey; width: number; align?: "right" };

const COLS: Col[] = [
  { key: "date",          labelKey: "export.col.date",        width: 60 },
  { key: "description",   labelKey: "export.col.description", width: 130 },
  { key: "category",      labelKey: "export.col.category",    width: 80 },
  { key: "wallet",        labelKey: "export.col.wallet",      width: 70 },
  { key: "member",        labelKey: "export.col.member",      width: 60 },
  { key: "_signedAmount", labelKey: "export.col.amount",      width: 0,  align: "right" },
];

// Total table width = page minus margins. The "_signedAmount" column
// soaks up the leftover so the table fills the page horizontally
// regardless of which fixed widths we set.
function withResolvedWidths(): Col[] {
  const fixed = COLS.reduce((s, c) => s + c.width, 0);
  const remaining = PAGE_W - MARGIN_X * 2 - fixed;
  return COLS.map((c) => (c.width === 0 ? { ...c, width: remaining } : c));
}

// Truncate a string so it doesn't overflow the column. Helvetica's average
// glyph width at size 9 is ~5 px, but rather than measure each glyph we
// approximate by character count and let the layout breathe. Worst case is
// a final ellipsis sitting one or two glyphs short of the column edge.
function fit(s: string, widthPt: number, sizePt: number): string {
  // Approx chars per point — calibrated for Helvetica.
  const maxChars = Math.max(1, Math.floor((widthPt - 4) / (sizePt * 0.55)));
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + "…";
}

// Replace characters Helvetica's WinAnsi encoding can't handle. The Indonesian
// alphabet is fully covered; "…" (U+2026) is the only non-WinAnsi codepoint
// we routinely emit (from the fit() helper). Map it to "..." to avoid
// pdf-lib's "WinAnsi cannot encode" throw.
function toWinAnsiSafe(s: string): string {
  return s
    .replace(/…/g, "...")  // … (horizontal ellipsis)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")    // en-dash
    .replace(/—/g, "-");   // em-dash
}

export async function buildPdf(rows: ExportRow[], meta: ExportMeta): Promise<Uint8Array> {
  const t = getT(meta.lang);
  const cols = withResolvedWidths();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Totals — computed once, rendered on the last page as a summary block.
  let totalIncome = 0;
  let totalExpense = 0;
  for (const r of rows) {
    if (r.type === "income") totalIncome += r.amount;
    else totalExpense += r.amount;
  }
  const net = totalIncome - totalExpense;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN_Y;

  // Header — drawn fresh on every page. Title, ledger + range, generated-at
  // timestamp. Generated-at is included so re-exports are distinguishable
  // when shared with a third party.
  function drawHeader() {
    page.drawText(toWinAnsiSafe(t("export.title")), {
      x: MARGIN_X,
      y: cursorY - FONT_SIZE_TITLE,
      size: FONT_SIZE_TITLE,
      font: bold,
      color: rgb(0.07, 0.07, 0.07),
    });
    cursorY -= FONT_SIZE_TITLE + 8;

    page.drawText(toWinAnsiSafe(`${meta.ledgerName}  ·  ${meta.start} → ${meta.end}`), {
      x: MARGIN_X,
      y: cursorY - FONT_SIZE_META,
      size: FONT_SIZE_META,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    cursorY -= FONT_SIZE_META + 4;

    page.drawText(toWinAnsiSafe(t("export.generated").replace("{at}", new Date(meta.generatedAt).toLocaleString())), {
      x: MARGIN_X,
      y: cursorY - 8,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    cursorY -= 8 + 10;

    // Column header row
    let x = MARGIN_X;
    for (const c of cols) {
      const label = toWinAnsiSafe(t(c.labelKey));
      if (c.align === "right") {
        const w = bold.widthOfTextAtSize(label, FONT_SIZE_HEAD);
        page.drawText(label, {
          x: x + c.width - w - 2,
          y: cursorY - FONT_SIZE_HEAD,
          size: FONT_SIZE_HEAD,
          font: bold,
          color: rgb(0.2, 0.2, 0.2),
        });
      } else {
        page.drawText(label, {
          x: x + 2,
          y: cursorY - FONT_SIZE_HEAD,
          size: FONT_SIZE_HEAD,
          font: bold,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      x += c.width;
    }
    cursorY -= FONT_SIZE_HEAD + 4;
    // Underline
    page.drawLine({
      start: { x: MARGIN_X, y: cursorY },
      end: { x: PAGE_W - MARGIN_X, y: cursorY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    cursorY -= 6;
  }

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    cursorY = PAGE_H - MARGIN_Y;
    drawHeader();
  }

  drawHeader();

  if (rows.length === 0) {
    // Empty-state — still a valid PDF so the user gets something they can
    // file/email. Keeps "empty range produces a sensible empty file" test
    // honest.
    page.drawText(toWinAnsiSafe(t("export.empty")), {
      x: MARGIN_X,
      y: cursorY - 30,
      size: 11,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    for (const r of rows) {
      // Page-break check: need ROW_H + room for the totals block on the
      // last page. We don't try to keep totals on the same page as rows —
      // they get their own breathing room on whatever page they land on.
      if (cursorY - ROW_H < MARGIN_Y + 40) {
        newPage();
      }

      // Alternating row tint — very faint, just enough to track across
      // the page without being heavy on toner if printed.
      const isAlt = (rows.indexOf(r) % 2) === 1;
      if (isAlt) {
        page.drawRectangle({
          x: MARGIN_X,
          y: cursorY - ROW_H + 4,
          width: PAGE_W - MARGIN_X * 2,
          height: ROW_H,
          color: rgb(0.97, 0.97, 0.97),
        });
      }

      let x = MARGIN_X;
      for (const c of cols) {
        let raw: string;
        if (c.key === "_signedAmount") {
          const sign = r.type === "income" ? "+" : "-";
          raw = `${sign}${formatAmount(r.amount, meta.currency)}`;
        } else {
          raw = String(r[c.key as keyof ExportRow] ?? "");
        }
        const safe = toWinAnsiSafe(raw);
        const text = fit(safe, c.width, FONT_SIZE_BODY);

        if (c.align === "right") {
          const w = font.widthOfTextAtSize(text, FONT_SIZE_BODY);
          page.drawText(text, {
            x: x + c.width - w - 2,
            y: cursorY - FONT_SIZE_BODY,
            size: FONT_SIZE_BODY,
            font,
            color: r.type === "income" ? rgb(0.05, 0.45, 0.27) : rgb(0.07, 0.07, 0.07),
          });
        } else {
          page.drawText(text, {
            x: x + 2,
            y: cursorY - FONT_SIZE_BODY,
            size: FONT_SIZE_BODY,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
        x += c.width;
      }
      cursorY -= ROW_H;
    }

    // Totals block — separated by a heavier rule for visual closure.
    if (cursorY - 60 < MARGIN_Y) {
      newPage();
    }
    cursorY -= 12;
    page.drawLine({
      start: { x: MARGIN_X, y: cursorY },
      end: { x: PAGE_W - MARGIN_X, y: cursorY },
      thickness: 0.8,
      color: rgb(0.5, 0.5, 0.5),
    });
    cursorY -= 14;

    const rightX = PAGE_W - MARGIN_X;
    function drawTotalLine(label: string, value: string, isBold = false) {
      const f = isBold ? bold : font;
      const valSafe = toWinAnsiSafe(value);
      const labelSafe = toWinAnsiSafe(label);
      const valW = f.widthOfTextAtSize(valSafe, 11);
      page.drawText(labelSafe, {
        x: MARGIN_X,
        y: cursorY,
        size: 11,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawText(valSafe, {
        x: rightX - valW,
        y: cursorY,
        size: 11,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursorY -= 15;
    }

    drawTotalLine(t("reports.income"), formatAmount(totalIncome, meta.currency));
    drawTotalLine(t("reports.expenses"), formatAmount(totalExpense, meta.currency));
    drawTotalLine(t("reports.netSavings"), formatAmount(net, meta.currency), true);
  }

  // Page numbers — applied as a post-pass so we know the total count.
  const pages = pdfDoc.getPages();
  const total = pages.length;
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${total}`;
    const w = font.widthOfTextAtSize(label, 8);
    p.drawText(label, {
      x: PAGE_W - MARGIN_X - w,
      y: 20,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  });

  return await pdfDoc.save();
}
