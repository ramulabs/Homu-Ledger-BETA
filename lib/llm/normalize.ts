// Description normaliser for the category-hints cache.
//
// The cache stores keywords (lowercased, trimmed, no quantities/units),
// so before we hit Gemini we try a few derived forms of the user's
// description against the cache. The goal: maximise hit rate without
// being so aggressive that we collapse genuinely different things.
//
// Examples (LHS = raw description, RHS = candidate lookup keys, in
// order of preference — longest/most-specific first):
//
//   "Paracetamol 500mg"     →  ["paracetamol 500mg", "paracetamol"]
//   "Indomaret · groceries" →  ["indomaret groceries", "indomaret"]
//   "Uber to airport"       →  ["uber to airport", "uber to", "uber"]
//   "  Coffee  "            →  ["coffee"]
//
// A LONGER candidate is checked first — that way "uber" still matches
// "uber to airport" even though it has more words, but a literally-
// stored "uber to airport" gets to win if someone took the time to
// teach the cache that specific phrase.

// Strip standalone quantity-with-unit tokens (e.g. "10mg", "500ml",
// "2pcs", "x3"). Conservative — only trailing tokens that look quanti-
// tative get dropped, so a legitimate "iPad mini 4" survives.
const UNIT_TOKEN_RE = /^[\dx][\dx.]*\s*(?:mg|ml|g|kg|l|pcs|pc|oz|lb|cm|m|km)?$/i;

// Punctuation we strip outright before tokenising. Bullets and middle-
// dots show up in copied receipt text; commas/colons/semicolons in
// pasted bank descriptions; quotes from anywhere.
const PUNCT_RE = /[·•:;,"'(){}\[\]<>!?@#$%^&*+=|\\/]/g;

/** Lowercase + collapse whitespace + strip noisy punctuation. */
function clean(s: string): string {
  return s
    .toLowerCase()
    .replace(PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop a trailing token if it's purely a quantity/unit. */
function dropTrailingUnit(tokens: string[]): string[] {
  if (tokens.length <= 1) return tokens;
  const last = tokens[tokens.length - 1];
  return UNIT_TOKEN_RE.test(last) ? tokens.slice(0, -1) : tokens;
}

/**
 * Return an ordered list of candidate cache keys for a raw description.
 * Caller iterates these in order; first hit wins.
 *
 * Always at least one element (the cleaned full string). Caller can
 * treat an empty input as "skip cache lookup, no candidates".
 */
export function candidateKeys(rawDescription: string): string[] {
  const cleaned = clean(rawDescription);
  if (!cleaned) return [];

  const tokens = cleaned.split(" ");
  const trimmed = dropTrailingUnit(tokens);

  // Deduplicate while preserving order. Set iteration in JS is
  // insertion-ordered which is exactly what we want here.
  const out = new Set<string>();
  out.add(trimmed.join(" "));

  // Progressively shorter prefixes — "uber to airport" → "uber to" → "uber".
  // This is what makes a single-word hint like "uber" still match a
  // multi-word description without us having to learn every phrasing.
  for (let i = trimmed.length - 1; i >= 1; i--) {
    out.add(trimmed.slice(0, i).join(" "));
  }

  // Also include each token in isolation (lowest priority — added last
  // so they sit at the back of the iteration). Useful for descriptions
  // like "milk + bread" where the meaningful token isn't the first.
  for (const tok of trimmed) {
    if (tok && !UNIT_TOKEN_RE.test(tok)) out.add(tok);
  }

  return Array.from(out);
}

/**
 * The "canonical" key for a description — used as the storage key when
 * we insert a NEW hint after a cache miss. We pick the cleaned full
 * description (minus trailing unit) so the next exact-typing of the
 * same thing hits the cache directly, without relying on prefix games.
 *
 * Returns null for empty / whitespace-only input.
 */
export function canonicalKey(rawDescription: string): string | null {
  const cleaned = clean(rawDescription);
  if (!cleaned) return null;
  const trimmed = dropTrailingUnit(cleaned.split(" "));
  return trimmed.join(" ");
}
