"use client";

// Settings → Integrations — RAM-25 Phase 1.
//
// Two sections: (1) the user's <local>@inbox.homu.app forwarding
// address, and (2) API keys for the n8n / power-user path.
//
// Newly created keys are shown ONCE in an amber "save this now" callout
// — we only store the SHA-256 hash, so there's no way to retrieve the
// raw key again afterwards.

import { useState } from "react";
import {
  ChevronLeft,
  Mail,
  Plus,
  Trash2,
  Key,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { TapLink } from "@/components/tap";
import { CopyButton } from "@/components/copy-button";
import {
  ensureInboxAddressAction,
  generateApiKeyAction,
  revokeApiKeyAction,
} from "@/app/actions/inbox";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
};

type Props = {
  initialAddress: string | null;
  keys: KeyRow[];
};

export default function IntegrationsShell({ initialAddress, keys }: Props) {
  const [address, setAddress] = useState<string | null>(initialAddress);
  const [newKey, setNewKey] = useState<{ key: string; prefix: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateAddress() {
    setBusy(true);
    setError(null);
    const res = await ensureInboxAddressAction();
    setBusy(false);
    if (res.ok) setAddress(res.address);
    else setError(res.error);
  }

  async function handleGenerateKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", trimmed);
    const res = await generateApiKeyAction(fd);
    setBusy(false);
    if (res.ok) {
      setNewKey({ key: res.key, prefix: res.prefix });
      setNewName("");
      // The address may have been provisioned implicitly — reflect that
      // locally so the user sees it without a refresh.
      if (!address) {
        const addrRes = await ensureInboxAddressAction();
        if (addrRes.ok) setAddress(addrRes.address);
      }
    } else {
      setError(res.error);
    }
  }

  async function handleRevoke(id: string) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    const res = await revokeApiKeyAction(fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="pb-4" style={{ marginBottom: "calc(-7rem + 1rem)" }}>
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
        <TapLink
          href="/settings"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform [touch-action:manipulation]"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </TapLink>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          Integrations
        </h1>
        <div className="h-9 w-9" />
      </header>

      {/* ── Email Inbox ─────────────────────────────────────────── */}
      <section className="mt-5">
        <p className="mb-2 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          Email inbox
        </p>
        <div className="mx-5 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-black/[0.04]">
          <p className="text-[13.5px] leading-snug text-[var(--label-secondary)]">
            Forward your bank-transaction emails to this address and HOMU will
            queue them for one-tap journaling.
          </p>
          {address ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--background)] px-3 py-2.5 ring-1 ring-black/[0.06]">
              <Mail
                className="h-4 w-4 shrink-0 text-[var(--label-secondary)]"
                strokeWidth={2}
              />
              <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--foreground)]">
                {address}
              </code>
              <CopyButton text={address} />
            </div>
          ) : (
            <button
              onClick={handleGenerateAddress}
              disabled={busy}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--foreground)] text-[14px] font-semibold text-[var(--on-foreground)] transition-opacity disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              Generate my inbox address
            </button>
          )}
          <p className="mt-3 text-[12px] leading-snug text-[var(--label-tertiary)]">
            Set up a Gmail filter from your bank&apos;s sender to forward here.
            Emails to addresses we never issued are rejected — only forwarded
            mail reaches HOMU.
          </p>
        </div>
      </section>

      {/* ── API Keys ────────────────────────────────────────────── */}
      <section className="mt-5">
        <p className="mb-2 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          API keys · n8n, scripts
        </p>
        <div className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04]">
          {/* Generate row */}
          <form
            onSubmit={handleGenerateKey}
            className="flex items-center gap-2 px-3 py-3"
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Key name (e.g. n8n at home)"
              maxLength={80}
              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--separator)] bg-[var(--background)] px-3 text-[14px] text-[var(--foreground)] outline-none placeholder:text-[var(--label-tertiary)] focus:border-[var(--foreground)]/30"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-[var(--foreground)] px-3 text-[13px] font-semibold text-[var(--on-foreground)] transition-opacity disabled:opacity-60"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Generate
            </button>
          </form>

          {/* Just-created key — shown ONCE */}
          {newKey && (
            <div className="mx-3 mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-700"
                  strokeWidth={2.25}
                />
                <p className="text-[12.5px] font-semibold text-amber-900">
                  Copy this key now — it won&apos;t be shown again.
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-amber-200">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px]">
                  {newKey.key}
                </code>
                <CopyButton text={newKey.key} />
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="mt-2 text-[12px] font-semibold text-amber-900 underline"
              >
                I&apos;ve saved it
              </button>
            </div>
          )}

          {/* Existing keys */}
          {keys.length === 0 ? (
            <p className="border-t border-[var(--separator)] px-4 py-4 text-[13px] text-[var(--label-tertiary)]">
              No API keys yet.
            </p>
          ) : (
            <ul className="border-t border-[var(--separator)] divide-y divide-[var(--separator)]">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Key
                    className="h-4 w-4 shrink-0 text-[var(--label-secondary)]"
                    strokeWidth={2}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[var(--foreground)]">
                      {k.name}
                    </p>
                    <p className="truncate text-[11.5px] text-[var(--label-secondary)]">
                      <span className="font-mono">{k.key_prefix}…</span>
                      {k.last_used_at && (
                        <> · used {formatRelative(k.last_used_at)}</>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(k.id)}
                    disabled={busy}
                    className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-rose-600 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {error && (
        <p className="mx-5 mt-3 rounded-xl bg-rose-50 px-3.5 py-2 text-[12.5px] text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <p className="mx-5 mt-6 text-[12px] leading-snug text-[var(--label-tertiary)]">
        Power users can POST pre-parsed transactions to
        <code className="mx-1 font-mono">/api/inbox/transactions</code>
        with <code className="mx-0.5 font-mono">Authorization: Bearer &lt;key&gt;</code>.
        See the RAM-25 PRD for the full payload shape and the n8n template.
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  return `${day} d ago`;
}
