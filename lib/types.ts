export type TransactionType = "income" | "expense";

export type FeedbackCategory = "bug" | "feature" | "question" | "other";
export type FeedbackStatus = "open" | "in_progress" | "closed";

export type DbFeedback = {
  id: string;
  created_at: string;
  created_by: string | null;
  household_id: string | null;
  subject: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  attachments: string[];
  reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
};

export type DbHousehold = {
  id: string;
  name: string;
  currency: string;
  symbol: string;
  invite_code?: string;
  owner_id?: string | null;
};

export type DbHouseholdMembership = {
  household_id: string;
  role: "owner" | "member";
  household: DbHousehold;
};

export type DbPendingInvitation = {
  id: string;
  household_id: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  household: { id: string; name: string; symbol: string | null; currency: string };
  inviter: { id: string; name: string; initials: string; avatar_color: string } | null;
};

/**
 * RAM-5 — per-category monthly budget.
 *
 * One row per (household_id, category_id). `amount` is in the same natural
 * units as transactions (numeric(14,2)); `spent` is filled in on read by the
 * `get_budget_spent_this_month` RPC and is NOT a DB column. The spent value
 * resets implicitly on the 1st of each calendar month because the RPC is
 * date-scoped — no rollover, no cron job.
 *
 * `crossedPct` (0–1) is a convenience client-side derived value: 0.8 = amber,
 * 1.0 = red "Over budget". Stored only in memory.
 */
export type DbBudget = {
  id: string;
  category_id: string;
  amount: number;
  currency: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Budget joined with the category metadata + this-month's spent total. */
export type BudgetWithProgress = {
  budget: DbBudget;
  category: DbCategory;
  spent: number;
  /** spent / amount, clamped to ≥ 0 (can exceed 1 when over budget). */
  ratio: number;
  /** "neutral" < 0.8 ≤ "warning" < 1.0 ≤ "over" */
  state: "neutral" | "warning" | "over";
};

export type DbCategory = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  type: TransactionType;
  is_default?: boolean;
};

export type DbWallet = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  initial_balance: number;
  is_default: boolean;
  /** ISO 4217 currency code, e.g. "IDR", "USD". Defaults to "IDR". */
  currency?: string;
};

export type DbFxRate = {
  base: string;
  target: string;
  rate: number;
  date: string;
};

export type SubscriptionTier = "3_months" | "6_months" | "1_year" | "lifetime" | "developer";

export type DbPromoCode = {
  id: string;
  code: string;
  tier: SubscriptionTier;
  created_at: string;
  created_by: string;
  // Optional free-text note the developer attaches when generating the
  // code (e.g. "For Andi", "Twitter giveaway"). Anyone with the string
  // can still redeem — this is purely a memo for the developer.
  label: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  // Joined from profiles so the developer can see WHO redeemed each code
  // — name + email so they can match it against the label they assigned.
  redeemer?: { id: string; name: string; email: string } | null;
};

export type PromoCodeStats = {
  total: number;
  redeemed: number;
  byTier: Record<SubscriptionTier, { generated: number; redeemed: number }>;
};

export type DbMember = {
  id: string;
  name: string;
  initials: string;
  avatar_color: string;
};

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export type DbRecurringItem = {
  id: string;
  type: TransactionType;
  amount: number;
  name: string;
  category_id: string | null;
  wallet_id: string | null;
  frequency: RecurringFrequency;
  next_due_date: string | null;
  repeat_until: string | null;
  created_by: string | null;
  created_at: string;
  categories: DbCategory | null;
  wallets: DbWallet | null;
};

export type DbTransaction = {
  id: string;
  type: TransactionType;
  amount: number;
  name: string;
  category_id: string | null;
  wallet_id: string | null;
  transfer_pair_id: string | null;
  recurring_item_id: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
  categories: DbCategory | null;
  wallets: DbWallet | null;
  /** Set on transfer rows after deduplication: the OTHER wallet in the pair. */
  peer_wallet?: DbWallet | null;
  photo_url: string | null;
  /** Synthesised client-side from a queued offline op (v1.36.0). When
   *  true, the row was added optimistically and is still waiting for
   *  replay. `transaction-list.tsx` styles it at 60% opacity + adds a
   *  "Pending" badge; the row vanishes when replay drains it and the
   *  server-rendered version takes its place. Server-loaded rows
   *  never carry this flag. */
  _pending?: boolean;
};
