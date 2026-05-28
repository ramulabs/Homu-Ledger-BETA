// RAM-28 — Client-side categorization rules evaluator.
//
// Pure function — no network, no server calls.
// Runs before AI categorization in the Add Transaction sheet.
//
// Evaluation semantics:
//   1. Iterate rules in their supplied order (order_idx ASC from getRules).
//   2. A rule matches when EVERY trigger in its triggers array evaluates true.
//   3. On match: collect all actions into the RuleMatch output.
//   4. If stop_processing is true (default), return immediately after the
//      first matching rule. If false, continue through remaining rules,
//      with later matches overwriting earlier ones for the same field.
//
// Usage:
//   const match = evaluateRules(txName, txAmount, rules);
//   if (match.category_id) setCategoryId(match.category_id);
//   if (match.notes)       setNotes(match.notes);

import type { DbTransactionRule } from "@/lib/types";

export type RuleMatch = {
  category_id?: string;
  notes?: string;
  /** Which rule (by name) produced this match — for the UI badge. */
  ruleName?: string;
};

/**
 * Evaluate an ordered list of rules against a transaction description and
 * amount. Returns the merged set of actions from all matching rules
 * (or the first matching rule when stop_processing is true).
 */
export function evaluateRules(
  name: string,
  amount: number,
  rules: DbTransactionRule[]
): RuleMatch {
  const result: RuleMatch = {};

  for (const rule of rules.filter((r) => r.enabled)) {
    const allTriggersMatch = rule.triggers.every((trigger) => {
      if (trigger.field === "name") {
        const v = trigger.value.toLowerCase();
        const n = name.toLowerCase();
        if (trigger.op === "contains") return n.includes(v);
        if (trigger.op === "starts_with") return n.startsWith(v);
        if (trigger.op === "equals") return n === v;
        return false;
      }
      if (trigger.field === "amount") {
        const v = parseFloat(trigger.value);
        if (isNaN(v)) return false;
        if (trigger.op === "equals") return amount === v;
        if (trigger.op === "gt") return amount > v;
        if (trigger.op === "lt") return amount < v;
        return false;
      }
      return false;
    });

    if (allTriggersMatch) {
      for (const action of rule.actions) {
        if (action.field === "category_id") result.category_id = action.value;
        if (action.field === "notes") result.notes = action.value;
      }
      // Surface the first (or last, when stop_processing=false) matching rule name.
      result.ruleName = rule.name;

      if (rule.stop_processing) return result;
    }
  }

  return result;
}
