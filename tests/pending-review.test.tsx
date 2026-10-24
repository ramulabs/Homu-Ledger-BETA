import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddTransactionSheet from "@/components/add-transaction-sheet";

const { api, refresh } = vi.hoisted(() => ({
  api: { preparePendingAccept: vi.fn(), findPendingDuplicates: vi.fn(), acceptPendingAction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), addTransfer: vi.fn(), addRecurringItem: vi.fn() },
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/ledger-action-client", () => api);
vi.mock("@/app/actions/transactions", () => ({ moveTransaction: vi.fn(), prepareMoveTransaction: vi.fn() }));
vi.mock("@/app/actions/ai", () => ({ suggestCategory: vi.fn().mockResolvedValue({ ok: false }), recordCategoryUsage: vi.fn().mockResolvedValue({}) }));
vi.mock("@/app/actions/photos", () => ({ signTransactionPhoto: vi.fn() }));
vi.mock("@/lib/queue-actions", () => ({ queuedAddTransaction: vi.fn().mockResolvedValue({}), isQueued: () => false, updateQueuedTransaction: vi.fn(), deleteQueuedTransaction: vi.fn() }));
vi.mock("@/components/category-picker", () => ({ default: () => null }));
vi.mock("@/components/wallet-picker-sheet", () => ({ default: () => null }));
vi.mock("@/components/photo-viewer", () => ({ default: () => null }));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn() }));

const ledgerA = "11111111-1111-4111-8111-111111111111";
const ledgerB = "22222222-2222-4222-8222-222222222222";
const pending = { itemId: "33333333-3333-4333-8333-333333333333", ledgers: [{ id: ledgerA, name: "Business", symbol: null }, { id: ledgerB, name: "Personal", symbol: null }], original: null };
const prefill = { amount: "100", name: "Draft purchase", date: "2026-10-25" };
const none = { ok: true, householdId: null, source: null, ledger: null };
function loaded(householdId: string, name = "Cash") {
  return { ok: true, householdId, source: null, ledger: { currency: "IDR", categories: [], wallets: [{ id: "wallet", name, symbol: "💵", color: "#22c55e", initial_balance: 0, is_default: true }], categoryId: null, categorySource: null, walletId: "wallet" } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function review(onClose = vi.fn()) {
  return { ...render(<AddTransactionSheet open onClose={onClose} categories={[]} wallets={[]} pending={pending} prefill={prefill} />), onClose };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.preparePendingAccept.mockResolvedValue(none);
  api.findPendingDuplicates.mockResolvedValue([]);
  api.acceptPendingAction.mockResolvedValue({ ok: true });
});

describe("pending review state", () => {
  it("disables wallet, category and save before a ledger is selected", async () => {
    review();
    await screen.findByRole("button", { name: "Select wallet" });
    await waitFor(() => expect(api.preparePendingAccept).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "Select wallet" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Category" }) as HTMLButtonElement).disabled).toBe(true);
    const save = screen.getByRole("button", { name: "Add Transaction" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.submit(save.closest("form")!);
    expect(api.acceptPendingAction).not.toHaveBeenCalled();
  });

  it("keeps fields disabled during ledger loading and enables them only on success", async () => {
    const gate = deferred<ReturnType<typeof loaded>>();
    api.preparePendingAccept.mockResolvedValueOnce(none).mockReturnValueOnce(gate.promise);
    review();
    const select = await screen.findByRole("combobox", { name: "Add to" });
    fireEvent.change(select, { target: { value: ledgerA } });
    expect((screen.getByRole("button", { name: "Select wallet" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { gate.resolve(loaded(ledgerA)); });
    expect((await screen.findByRole("button", { name: "Cash" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Category" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores a late response from the previously chosen ledger", async () => {
    const first = deferred<ReturnType<typeof loaded>>();
    const second = deferred<ReturnType<typeof loaded>>();
    api.preparePendingAccept.mockImplementation((input) => input.householdId === ledgerA ? first.promise : input.householdId === ledgerB ? second.promise : Promise.resolve(none));
    review();
    const select = await screen.findByRole("combobox", { name: "Add to" });
    fireEvent.change(select, { target: { value: ledgerA } });
    fireEvent.change(select, { target: { value: ledgerB } });
    await act(async () => { second.resolve(loaded(ledgerB, "Personal cash")); });
    await screen.findByRole("button", { name: "Personal cash" });
    await act(async () => { first.resolve(loaded(ledgerA, "Business cash")); });
    expect(screen.queryByRole("button", { name: "Business cash" })).toBeNull();
    expect(screen.getByRole("button", { name: "Personal cash" })).toBeTruthy();
  });

  it("recovers from a failed ledger request without enabling stale pickers", async () => {
    api.preparePendingAccept.mockResolvedValueOnce(none).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(loaded(ledgerA));
    review();
    fireEvent.change(await screen.findByRole("combobox", { name: "Add to" }), { target: { value: ledgerA } });
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect((screen.getByRole("button", { name: "Select wallet" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retry);
    expect((await screen.findByRole("button", { name: "Cash" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("submits once, closes after the confirmed write, then refreshes in the background", async () => {
    api.preparePendingAccept.mockResolvedValue(loaded(ledgerA));
    const gate = deferred<{ ok: true }>();
    api.acceptPendingAction.mockReturnValue(gate.promise);
    const order: string[] = [];
    refresh.mockImplementation(() => { order.push("refresh"); return new Promise(() => {}); });
    const onClose = vi.fn(() => order.push("close"));
    review(onClose);
    await screen.findByRole("button", { name: "Cash" });
    const save = screen.getByRole("button", { name: "Add Transaction" });
    fireEvent.submit(save.closest("form")!);
    fireEvent.submit(save.closest("form")!);
    expect(api.acceptPendingAction).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { gate.resolve({ ok: true }); });
    expect(order).toEqual(["close", "refresh"]);
  });

  it("shows a retryable error and releases the busy state when a save fails", async () => {
    api.preparePendingAccept.mockResolvedValue(loaded(ledgerA));
    api.acceptPendingAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    review();
    await screen.findByRole("button", { name: "Cash" });
    fireEvent.click(screen.getByRole("button", { name: "Add Transaction" }));
    await screen.findByText("Couldn't finish the request. Please try again.");
    expect((screen.getByRole("button", { name: "Add Transaction" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
