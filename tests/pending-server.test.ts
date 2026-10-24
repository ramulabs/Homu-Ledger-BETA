import { describe, expect, it, vi } from "vitest";
import { acceptPending, preparePending, type Admin } from "@/lib/pending-server";

const { background } = vi.hoisted(() => ({ background: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => background.push(task) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
type Query = { table: string; operation: string; filters: Record<string, unknown> };
type Result = { data?: unknown; error?: unknown };
function database(handler: (query: Query) => Result | Promise<Result>) {
  const calls: Query[] = [];
  const admin = { from(table: string) {
    const query: Query = { table, operation: "select", filters: {} };
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "order", "limit", "maybeSingle", "single", "is", "gte", "lte", "in"]) chain[name] = () => chain;
    chain.eq = (key: string, value: unknown) => { query.filters[key] = value; return chain; };
    for (const name of ["insert", "update", "upsert"]) chain[name] = () => { query.operation = name; return chain; };
    chain.then = (resolve: (result: Result) => void, reject: (error: unknown) => void) => {
      calls.push(query);
      return Promise.resolve(handler(query)).then(resolve, reject);
    };
    return chain;
  } } as unknown as Admin;
  return { admin, calls };
}
const input = { itemId: "item", householdId: "ledger", type: "expense", amount: "100", name: "Test purchase", categoryId: "category", walletId: "wallet", date: "2026-10-25" };
function valid(query: Query): Result {
  if (query.table === "inbox_items") return { data: query.operation === "select" ? { id: "item", status: "pending", parsed: { category: "Other" } } : null };
  if (query.table === "household_members") return { data: { household_id: "ledger" } };
  if (query.table === "categories") return { data: { type: "expense" } };
  if (query.table === "wallets") return { data: { id: "wallet" } };
  if (query.table === "transactions") return { data: { id: "transaction" } };
  return { data: null };
}

describe("pending critical path", () => {
  it("validates item, membership, category and wallet concurrently before inserting", async () => {
    const gate = deferred<Result>();
    const db = database((query) => ["inbox_items", "household_members", "categories", "wallets"].includes(query.table) && query.operation === "select" ? gate.promise.then(() => valid(query)) : valid(query));
    const promise = acceptPending(db.admin, "user", input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(db.calls.map((query) => query.table).sort()).toEqual(["categories", "household_members", "inbox_items", "wallets"]);
    gate.resolve({ data: null });
    expect(await promise).toEqual({ ok: true });
    expect(db.calls.some((query) => query.operation === "upsert")).toBe(false);
    await background.pop()?.();
    expect(db.calls.some((query) => query.operation === "upsert")).toBe(true);
  });

  it("refuses foreign-ledger wallets and nonmembers without writing", async () => {
    for (const missing of ["wallets", "household_members"]) {
      const db = database((query) => query.table === missing ? { data: null } : valid(query));
      expect((await acceptPending(db.admin, "user", input)).ok).toBe(false);
      expect(db.calls.some((query) => query.operation !== "select")).toBe(false);
    }
  });

  it("reports a failed review update instead of claiming the pending item was accepted", async () => {
    const db = database((query) => query.table === "inbox_items" && query.operation === "update" ? { error: { message: "Unavailable" } } : valid(query));
    const result = await acceptPending(db.admin, "user", input);
    expect(result.ok).toBe(false);
    expect("error" in result && result.error).toContain("without adding another");
  });

  it("loads item and memberships in parallel, then loads one ledger's lists together", async () => {
    const gate = deferred<Result>();
    const db = database((query) => {
      if (query.table === "inbox_items") return gate.promise.then(() => valid(query));
      if (query.table === "household_members") return gate.promise.then(() => ({ data: [{ household_id: "ledger", household: { name: "Business" } }] }));
      if (query.table === "households") return { data: { currency: "IDR" } };
      if (query.table === "categories") return { data: [{ id: "category", name: "Other", type: "expense" }] };
      if (query.table === "wallets") return { data: [{ id: "wallet", name: "Cash", initial_balance: 0, is_default: true }] };
      return { data: [] };
    });
    const promise = preparePending(db.admin, "user", { itemId: "item", householdId: "ledger" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(db.calls.map((query) => query.table).sort()).toEqual(["household_members", "inbox_items"]);
    gate.resolve({});
    const result = await promise;
    expect(result.ok && result.ledger?.walletId).toBe("wallet");
    expect(db.calls.filter((query) => query.table === "household_members")).toHaveLength(1);
  });
});
