"use client";

import type { PrepareResult } from "@/lib/pending-server";

// Fetches are independent of Next's serial Server Action queue. Reads cannot
// hold up Save, and mutations return before the page is rendered again.
async function request<T>(action: string, input: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch("/api/ledger-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, input }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok && !result.error) throw new Error("Unable to complete the request. Please try again.");
    return result as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

type MutationResult = { error?: string };
function fields(data: FormData) {
  return Object.fromEntries([...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function addTransaction(data: FormData) { return request<MutationResult>("add", { fields: fields(data) }); }
export function updateTransaction(id: string, data: FormData) { return request<MutationResult>("update", { id, fields: fields(data) }); }
export function deleteTransaction(id: string) { return request<MutationResult>("delete", { id }); }
export function addTransfer(data: FormData) { return request<MutationResult>("transfer", { fields: fields(data) }); }
export function addRecurringItem(data: FormData) { return request<{ error?: string }>("recurring", { fields: fields(data) }); }
export function rejectInboxItemAction(data: FormData) { return request<{ ok: true } | { ok: false; error: string }>("reject", { id: data.get("id") }); }
export function acceptPendingAction(input: {
  itemId: string; householdId: string; type: string; amount: string; name: string;
  categoryId: string | null; walletId: string | null; date: string;
}) { return request<{ ok: true } | { ok: false; error: string }>("accept", input); }
export function preparePendingAccept(input: {
  itemId: string; householdId?: string; description?: string; type?: "income" | "expense";
}, signal?: AbortSignal) { return request<PrepareResult>("prepare", input, signal); }
export async function findPendingDuplicates(input: { householdId: string; amount: string; date: string }, signal?: AbortSignal) {
  const result = await request<{ matches?: { date: string; name: string; amount: number }[]; error?: string }>("duplicates", input, signal);
  if (result.error) throw new Error(result.error);
  return result.matches ?? [];
}
