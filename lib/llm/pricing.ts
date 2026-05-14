// Per-model token pricing for the dev-panel cost estimates.
//
// Numbers are USD per 1,000,000 tokens (Google's published unit). We
// keep them here as constants so a future provider/model add only has
// to edit this table and lib/llm/* picks it up automatically.
//
// Last updated: based on Google's Gemini Flash-Lite tier (early 2025).
// If you bump the model, double-check pricing — Google occasionally
// adjusts it without renaming the model.

type Pricing = { inputPerM: number; outputPerM: number };

const TABLE: Record<string, Pricing> = {
  // Google Gemini Flash-Lite — what we use by default. Free tier
  // covers ~1,500 requests/day, but the paid rates kick in once we
  // exceed that, so the math still matters.
  "gemini-2.5-flash-lite": { inputPerM: 0.10, outputPerM: 0.40 },
  "gemini-2.5-flash":      { inputPerM: 0.30, outputPerM: 2.50 },
  // Fallbacks — kept so old api_usage_logs rows still cost out
  // correctly if we ever bumped the model in production.
  "gemini-1.5-flash":      { inputPerM: 0.075, outputPerM: 0.30 },
};

/**
 * Estimate USD cost for a single call. Returns 0 for any model we
 * don't recognise — we'd rather underreport than crash the dev panel.
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = TABLE[model];
  if (!p) return 0;
  return (
    (inputTokens / 1_000_000) * p.inputPerM +
    (outputTokens / 1_000_000) * p.outputPerM
  );
}

/** True if we know how to price this model — used in the dev panel
 *  to show a "(approx)" warning otherwise. */
export function hasPricing(model: string): boolean {
  return model in TABLE;
}
