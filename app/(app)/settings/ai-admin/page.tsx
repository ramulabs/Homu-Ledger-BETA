// AI dev panel. Developer-only — gated by `is_developer` on the
// profile. Shows:
//   1. The Gemini API key (masked) + Save/Clear + Test Connection.
//   2. This-month usage rollup: calls, tokens, cost, cache hit rate.
//
// All write operations route through app/actions/ai.ts which checks
// the developer flag server-side, so the page-level guard here is
// mostly UX (don't show the panel to non-devs) — the security
// boundary is enforced by RLS + the SECURITY DEFINER RPCs.

import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import AiAdminShell from "@/components/ai-admin-shell";

export default async function AiAdminPage() {
  const { supabase, profile } = await requireSession();
  if (!profile?.is_developer) notFound();

  // Has a Gemini API key been saved? We never read the value back to
  // the client — only whether it's set. The shell shows a masked
  // placeholder in that case, and the developer has to re-paste the
  // key to update it. Simpler than implementing reveal/decryption.
  const { data: keyRow } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", "gemini_api_key")
    .maybeSingle();

  const keyConfigured = !!keyRow?.value && keyRow.value.trim().length > 0;
  const keyUpdatedAt = keyConfigured ? keyRow?.updated_at ?? null : null;

  // This-month usage. Aggregated server-side so the client only sees
  // totals (no per-row leakage of api_usage_logs.preview, which can
  // contain trimmed transaction descriptions). We compute in JS for
  // clarity; volumes are tiny so the round-trip + aggregate is fine.
  const firstOfMonth = new Date();
  firstOfMonth.setUTCDate(1);
  firstOfMonth.setUTCHours(0, 0, 0, 0);

  const { data: logsRaw } = await supabase
    .from("api_usage_logs")
    .select("input_tokens, output_tokens, total_tokens, estimated_cost_usd, cache_status")
    .gte("created_at", firstOfMonth.toISOString());

  const logs = logsRaw ?? [];
  const totals = logs.reduce(
    (acc, row) => {
      acc.calls += 1;
      acc.inputTokens += row.input_tokens ?? 0;
      acc.outputTokens += row.output_tokens ?? 0;
      acc.totalTokens += row.total_tokens ?? 0;
      acc.cost += Number(row.estimated_cost_usd ?? 0);
      if (row.cache_status === "hit") acc.hits += 1;
      else if (row.cache_status === "miss") acc.misses += 1;
      else if (row.cache_status === "error") acc.errors += 1;
      return acc;
    },
    {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      hits: 0,
      misses: 0,
      errors: 0,
    }
  );

  // Hit rate = hits / (hits + misses). Errors don't count either way
  // — they're a separate metric ("X% of attempts failed", surfaced
  // alongside the headline).
  const hitDenom = totals.hits + totals.misses;
  const hitRate = hitDenom > 0 ? totals.hits / hitDenom : null;

  return (
    <AiAdminShell
      keyConfigured={keyConfigured}
      keyUpdatedAt={keyUpdatedAt}
      stats={{
        calls: totals.calls,
        totalTokens: totals.totalTokens,
        cost: totals.cost,
        hits: totals.hits,
        misses: totals.misses,
        errors: totals.errors,
        hitRate,
      }}
    />
  );
}
