import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import PendingFab from "@/components/pending-fab";

const { load, reject } = vi.hoisted(() => ({ load: vi.fn(), reject: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: load }) }) }) }) }));
vi.mock("@/lib/ledger-action-client", () => ({ rejectInboxItemAction: reject }));
const item = { id: "pending-item", source_domain: "mcp", received_at: "2026-10-25T00:00:00Z", parsed: { name: "Draft purchase", amount: 100, type: "expense", date: "2026-10-25" } };
beforeEach(() => { vi.clearAllMocks(); load.mockResolvedValue({ data: [item] }); reject.mockResolvedValue({ ok: true }); });

it("removes a confirmed deletion immediately and rejects stale refresh results", async () => {
  let finishRefresh!: (value: unknown) => void;
  const refresh = new Promise((resolve) => { finishRefresh = resolve; });
  load.mockResolvedValueOnce({ data: [item] }).mockReturnValueOnce(refresh);
  render(<PendingFab currency="IDR" onAccept={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pending transactions: 1" }));
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await act(async () => {});
  expect(reject).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Draft purchase")).toBeNull();
  await act(async () => { finishRefresh({ data: [item] }); });
  expect(screen.queryByText("Draft purchase")).toBeNull();
});

it("keeps a failed deletion available for retry and clears the busy state", async () => {
  reject.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<PendingFab currency="IDR" onAccept={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pending transactions: 1" }));
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByText("Couldn't finish the request. Please try again.");
  expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText("Draft purchase")).toBeTruthy();
});


it("hides an accepted item before a background refresh finishes and keeps it hidden on stale responses", async () => {
  let finishRefresh!: (value: unknown) => void;
  load.mockResolvedValueOnce({ data: [item] }).mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve; }));
  const onAccept = vi.fn();
  const { rerender } = render(<PendingFab currency="IDR" onAccept={onAccept} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pending transactions: 1" }));
  expect(screen.getByText("Draft purchase")).toBeTruthy();
  rerender(<PendingFab currency="IDR" onAccept={onAccept} refreshSignal={1} resolvedItemIds={[item.id]} />);
  expect(screen.queryByText("Draft purchase")).toBeNull();
  await act(async () => { finishRefresh({ data: [item] }); });
  expect(screen.queryByText("Draft purchase")).toBeNull();
});
