// The free, deterministic layers of auto-categorisation:
//   1. disambiguation rules  ("ayam 500g" → Groceries)
//   2. this household's learned hints (category_hints)
//   3. the global keyword seed (category_keyword_seeds)
//
// Shared by suggestCategory() in the app (which falls through to Gemini on
// a miss) and the MCP add_transaction tool (which leaves a miss to the
// calling agent — it is already an AI and can pick from list_categories).
// Takes an explicit Supabase client so it works with both the cookie
// session and an MCP bearer token.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { candidateKeys } from "@/lib/llm/normalize";
import { disambiguate } from "@/lib/llm/disambiguation";

export type LocalCategory = { id: string; name: string; type: string };

export type LocalMatch = {
  categoryId: string;
  categoryName: string;
  source: "rule" | "cache" | "seed";
};

/**
 * @param categories the household's categories already filtered to `type`.
 * @returns the first match across the three layers, or null.
 */
export async function matchCategoryLocally(
  supabase: SupabaseClient<Database>,
  householdId: string,
  description: string,
  type: "income" | "expense",
  categories: LocalCategory[]
): Promise<LocalMatch | null> {
  if (categories.length === 0) return null;
  const allowedIds = new Set(categories.map((c) => c.id));
  // Rule + seed results are keyed by category NAME, resolved here against
  // the household's own categories.
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  // ── Layer 1: disambiguation rules ─────────────────────────────────
  // A rule forces a category by name; if this household doesn't own it
  // (e.g. a Personal-template user has no "Date nights") we fall through.
  const ruled = disambiguate(description, type);
  if (ruled) {
    const cat = byName.get(ruled.categoryName.toLowerCase());
    if (cat) return { categoryId: cat.id, categoryName: cat.name, source: "rule" };
  }

  const candidates = candidateKeys(description);
  if (candidates.length === 0) return null;

  // ── Layer 2: per-household cache ──────────────────────────────────
  // One query for every candidate, then walk candidates IN ORDER so the
  // longest / most specific key wins.
  const { data: hints } = await supabase
    .from("category_hints")
    .select("keyword, category_id")
    .eq("household_id", householdId)
    .in("keyword", candidates);

  if (hints && hints.length > 0) {
    const hintByKey = new Map(hints.map((h) => [h.keyword, h]));
    for (const key of candidates) {
      const hit = hintByKey.get(key);
      if (hit && allowedIds.has(hit.category_id)) {
        const cat = categories.find((c) => c.id === hit.category_id);
        if (cat) return { categoryId: cat.id, categoryName: cat.name, source: "cache" };
      }
    }
  }

  // ── Layer 3: global keyword seed ──────────────────────────────────
  const { data: seeds } = await supabase
    .from("category_keyword_seeds")
    .select("keyword, category_name")
    .in("keyword", candidates);

  if (seeds && seeds.length > 0) {
    const seedByKey = new Map(seeds.map((s) => [s.keyword, s]));
    for (const key of candidates) {
      const seed = seedByKey.get(key);
      if (seed) {
        const cat = byName.get(seed.category_name.toLowerCase());
        if (cat) return { categoryId: cat.id, categoryName: cat.name, source: "seed" };
      }
    }
  }

  return null;
}
