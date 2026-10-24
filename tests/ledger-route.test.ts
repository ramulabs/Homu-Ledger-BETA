import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ledger-actions/route";

const actions = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), remove: vi.fn(), transfer: vi.fn(), recurring: vi.fn(), reject: vi.fn(), accept: vi.fn(), prepare: vi.fn(), duplicates: vi.fn() }));
vi.mock("@/app/actions/transactions", () => ({ addTransaction: actions.add, updateTransaction: actions.update, deleteTransaction: actions.remove, addTransfer: actions.transfer }));
vi.mock("@/app/actions/recurring", () => ({ addRecurringItem: actions.recurring }));
vi.mock("@/app/actions/inbox", () => ({ rejectInboxItemAction: actions.reject }));
vi.mock("@/app/actions/pending", () => ({ acceptPendingAction: actions.accept, preparePendingAccept: actions.prepare, findPendingDuplicates: actions.duplicates }));
vi.mock("@/app/actions/ai", () => ({ recordCategoryUsage: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
function request(body: unknown, origin = "https://homu.test", contentType = "application/json") {
  return new NextRequest("https://homu.test/api/ledger-actions", { method: "POST", headers: { Origin: origin, "Content-Type": contentType }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); actions.reject.mockResolvedValue({ ok: true }); });

it("rejects cross-origin and non-JSON writes before invoking any mutation", async () => {
  expect((await POST(request({ action: "reject", input: { id } }, "https://other.test"))).status).toBe(403);
  expect((await POST(request({ action: "reject", input: { id } }, "https://homu.test", "text/plain"))).status).toBe(403);
  expect(actions.reject).not.toHaveBeenCalled();
});
it("rejects malformed operations before invoking a mutation", async () => {
  expect((await POST(request({ action: "reject", input: { id: "bad-id" } }))).status).toBe(400);
  expect((await POST(request({ action: "arbitraryFunction", input: { id } }))).status).toBe(400);
  expect(actions.reject).not.toHaveBeenCalled();
});
it("delegates valid writes to the existing authorized function and returns JSON", async () => {
  const response = await POST(request({ action: "reject", input: { id } }));
  expect(await response.json()).toEqual({ ok: true });
  expect(actions.reject.mock.calls[0][0].get("id")).toBe(id);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("accepts the real request host when Next normalizes a localhost alias", async () => {
  const req = new NextRequest("http://localhost:3000/api/ledger-actions", { method: "POST", headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000", "Content-Type": "application/json" }, body: JSON.stringify({ action: "reject", input: { id } }) });
  expect((await POST(req)).status).toBe(200);
  expect(actions.reject).toHaveBeenCalledTimes(1);
});
it("returns an explicit 401 for an expired session rather than login HTML", async () => {
  actions.reject.mockRejectedValue({ digest: "NEXT_REDIRECT;replace;/login;307;" });
  const response = await POST(request({ action: "reject", input: { id } }));
  expect(response.status).toBe(401);
  expect((await response.json()).error).toContain("sign in");
});
