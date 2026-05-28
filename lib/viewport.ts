// Visible-viewport height fallback chain — used by bottom-anchored sheets
// (AddTransactionSheet, AddCategorySheet, EditCategorySheet, AddRecurringSheet)
// to size their wrapper to the *visible* area, i.e. the screen minus the
// on-screen keyboard.
//
// Why this exists: relying on CSS `100dvh` or on `window.visualViewport.height`
// alone leaves the sheet 0px tall on older Android Chrome / WebView builds
// — `dvh` shipped in Chrome 108 (Nov 2022), and some pre-108 / WebView combos
// also return 0 from VisualViewport on the first read. Either way the sheet
// collapses to a 1-2px sliver "stuck at the bottom" and the user can't open
// Add Transaction at all. This helper falls back through three layers so at
// least one always returns a usable height.

export function readViewportHeight(): number | null {
  if (typeof window === "undefined") return null;
  const vvH = window.visualViewport?.height ?? 0;
  if (vvH > 0) return vvH;
  if (window.innerHeight > 0) return window.innerHeight;
  const docH = document.documentElement?.clientHeight ?? 0;
  return docH > 0 ? docH : null;
}

export function readViewportOffsetTop(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.offsetTop ?? 0;
}
