import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queuedAddTransaction } from "@/lib/queue-actions";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sync-queue", () => ({ enqueue }));
vi.mock("@/app/actions/wallets", () => ({ addWallet: vi.fn() }));
vi.mock("@/app/actions/categories", () => ({ addCategory: vi.fn() }));
const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
afterEach(() => { vi.unstubAllGlobals(); if (originalOnline) Object.defineProperty(navigator, "onLine", originalOnline); else Reflect.deleteProperty(navigator, "onLine"); });
function draft() { const data = new FormData(); data.set("name", "Draft purchase"); data.set("amount", "100"); return data; }

it("preserves the write idempotency key when using the independent HTTP transport", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  const data = draft();
  expect(await queuedAddTransaction(data)).toEqual({});
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.action).toBe("add");
  expect(body.input.fields.client_op_id).toBe(data.get("client_op_id"));
  expect(body.input.fields.amount).toBe("100");
  expect(enqueue).not.toHaveBeenCalled();
});
it("keeps the same operation id when a connection failure sends a save to the offline queue", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const data = draft();
  expect(await queuedAddTransaction(data)).toEqual({ queued: true });
  const operation = enqueue.mock.calls[0][0];
  expect(operation.id).toBe(data.get("client_op_id"));
  expect(operation.payload.client_op_id).toBe(operation.id);
});
it("does not queue a server validation rejection as a new write", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: "Invalid amount" }) }));
  expect(await queuedAddTransaction(draft())).toEqual({ error: "Invalid amount" });
  expect(enqueue).not.toHaveBeenCalled();
});
