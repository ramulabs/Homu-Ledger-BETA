"use client";

// RAM-9 — Notifications Settings shell.
//
// Three sections:
//   1. Master toggle  — gated on runtime. On iOS Capacitor we show a
//                       "coming soon" notice because Web Push doesn't
//                       work in WKWebView. On every other runtime we
//                       run the browser permission dance + subscribe.
//   2. Per-type prefs — only visible when the current device has at
//                       least one enabled subscription. Toggles
//                       recurring/budget/daily on the dispatcher's
//                       prefs filter.
//   3. Subscribed devices — list of rows, with a delete-per-row button
//                       (re-uses the row pattern from devices-shell
//                       without the two-step arming — one tap fully
//                       deletes since the row's just metadata).

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bell, BellOff, Smartphone, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import { getRuntime, type Runtime } from "@/lib/runtime";
import { parseUserAgent } from "@/lib/user-agent";
import {
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPrefs,
  type DbPushSubscription,
  type NotificationPrefs,
} from "@/app/actions/push";

type Props = {
  initialSubscriptions: DbPushSubscription[];
  vapidPublicKey: string;
};

// Helper: PushManager.subscribe needs the public key as a Uint8Array,
// not the base64url string the server stores. Standard recipe per the
// Web Push spec.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Allocate the underlying ArrayBuffer explicitly so the resulting view is
  // Uint8Array<ArrayBuffer> (a BufferSource) and not the wider
  // Uint8Array<ArrayBufferLike> default — PushManager.applicationServerKey
  // requires the narrower type.
  const buffer = new ArrayBuffer(rawData.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) out[i] = rawData.charCodeAt(i);
  return out;
}

type SubscribeError =
  | null
  | { kind: "denied" }
  | { kind: "unsupported" }
  | { kind: "generic"; message: string };

// useSyncExternalStore wants a `subscribe` even though we never change
// the runtime over the component lifetime — the runtime is fixed at
// page load. No-op subscriber is the documented escape hatch.
const noopSubscribe = () => () => {};

export default function NotificationsShell({
  initialSubscriptions,
  vapidPublicKey,
}: Props) {
  const t = useT();
  const router = useRouter();
  // Runtime detection happens client-side (the server can't know whether
  // the visiting browser is iOS Capacitor). useSyncExternalStore gives us
  // a SSR-safe pattern: `getServerSnapshot` returns null so the server
  // markup renders the "loading" branch; on the client it flips to the
  // real runtime on first paint without a setState-in-effect.
  const runtime = useSyncExternalStore<Runtime | null>(
    noopSubscribe,
    getRuntime,
    () => null
  );
  const [subs, setSubs] = useState<DbPushSubscription[]>(initialSubscriptions);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<SubscribeError>(null);

  // Look up the browser's existing PushSubscription so we know which
  // DB row is "this device" (for the master toggle + the badge in the
  // device list).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        setCurrentEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const currentSub = useMemo(
    () => subs.find((s) => s.endpoint === currentEndpoint) ?? null,
    [subs, currentEndpoint]
  );

  const isEnabledHere = !!currentSub?.enabled;

  // ── iOS Capacitor gate ───────────────────────────────────────────
  if (runtime === "ios-native") {
    return (
      <div className="mx-5 mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/60">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-[15px] font-semibold text-amber-900">
              {t("notif.iosNative.title")}
            </p>
            <p className="mt-1 text-[13px] text-amber-800">
              {t("notif.iosNative.body")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Unsupported browser ──────────────────────────────────────────
  // Detect AFTER runtime is known so we don't flash this on Capacitor
  // (Capacitor's WKWebView also reports no PushManager).
  if (
    runtime !== null &&
    typeof window !== "undefined" &&
    (!("serviceWorker" in navigator) || !("PushManager" in window))
  ) {
    return (
      <div className="mx-5 mt-6 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-black/[0.04]">
        <p className="text-[13px] text-[var(--label-secondary)]">
          {t("notif.unsupported")}
        </p>
      </div>
    );
  }

  async function handleEnable() {
    setErr(null);
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setErr({ kind: "unsupported" });
        return;
      }
      if (!vapidPublicKey) {
        setErr({
          kind: "generic",
          message: "Push not configured (missing VAPID public key).",
        });
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setErr({ kind: "denied" });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setErr({ kind: "generic", message: "Browser returned malformed subscription." });
        return;
      }

      const res = await subscribeToPush(
        {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
        navigator.userAgent
      );
      if (!res.ok) {
        setErr({ kind: "generic", message: res.error });
        return;
      }
      setCurrentEndpoint(json.endpoint);
      router.refresh();
    } catch (e) {
      setErr({
        kind: "generic",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!currentSub?.endpoint) return;
    setErr(null);
    setBusy(true);
    try {
      // Unsubscribe browser-side first so the next "enable" round-trip
      // starts from a clean state. If this fails the DB delete still
      // happens — leftover browser subs are harmless (they just won't
      // receive anything because the DB row's gone).
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe().catch(() => {});
      const res = await unsubscribeFromPush(currentSub.endpoint);
      if (!res.ok) {
        setErr({ kind: "generic", message: res.error });
        return;
      }
      setCurrentEndpoint(null);
      setSubs((prev) => prev.filter((s) => s.id !== currentSub.id));
    } catch (e) {
      setErr({
        kind: "generic",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePref(
    sub: DbPushSubscription,
    key: keyof NotificationPrefs
  ) {
    const next = { ...sub.prefs, [key]: !sub.prefs[key] };
    // Optimistic update
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, prefs: next } : s)));
    const res = await updateNotificationPrefs(sub.id, { [key]: next[key] });
    if (!res.ok) {
      // Revert on failure.
      setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, prefs: sub.prefs } : s)));
      setErr({ kind: "generic", message: res.error });
    }
  }

  async function handleRemove(sub: DbPushSubscription) {
    if (!sub.endpoint) return;
    const res = await unsubscribeFromPush(sub.endpoint);
    if (!res.ok) {
      setErr({ kind: "generic", message: res.error });
      return;
    }
    setSubs((prev) => prev.filter((s) => s.id !== sub.id));
    if (sub.endpoint === currentEndpoint) setCurrentEndpoint(null);
  }

  return (
    <div className="mt-4">
      {/* Master toggle */}
      <section className="mx-5">
        <div className="overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04]">
          <div className="flex items-start gap-3 px-4 py-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[var(--foreground)]">
              {isEnabledHere ? (
                <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
              ) : (
                <BellOff className="h-[18px] w-[18px]" strokeWidth={2} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-[var(--foreground)]">
                {t("notif.master.label")}
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--label-secondary)]">
                {t("notif.master.desc")}
              </p>
            </div>
            <button
              type="button"
              onClick={isEnabledHere ? handleDisable : handleEnable}
              disabled={busy}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors [touch-action:manipulation]",
                isEnabledHere
                  ? "bg-rose-100 text-rose-700 active:bg-rose-200"
                  : "bg-emerald-600 text-white active:bg-emerald-700",
                busy && "opacity-60"
              )}
            >
              {busy
                ? t("notif.master.busy")
                : isEnabledHere
                ? t("notif.master.disable")
                : t("notif.master.label")}
            </button>
          </div>

          {err && (
            <div className="border-t border-[var(--separator)] bg-rose-50 px-4 py-3">
              <p className="text-[13px] text-rose-700">
                {err.kind === "denied"
                  ? t("notif.permission.denied")
                  : err.kind === "unsupported"
                  ? t("notif.unsupported")
                  : err.message || t("notif.permission.error")}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Per-type prefs (only when subscribed on THIS device) */}
      {currentSub && (
        <section className="mt-6">
          <p className="mb-2 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
            {t("notif.types.title")}
          </p>
          <ul className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
            <PrefRow
              label={t("notif.types.recurring.label")}
              desc={t("notif.types.recurring.desc")}
              checked={currentSub.prefs.recurring_due}
              onToggle={() => handleTogglePref(currentSub, "recurring_due")}
            />
            <PrefRow
              label={t("notif.types.budget.label")}
              desc={t("notif.types.budget.desc")}
              checked={currentSub.prefs.budget_warnings}
              onToggle={() => handleTogglePref(currentSub, "budget_warnings")}
            />
            <PrefRow
              label={t("notif.types.daily.label")}
              desc={t("notif.types.daily.desc")}
              checked={currentSub.prefs.daily_nudge}
              onToggle={() => handleTogglePref(currentSub, "daily_nudge")}
            />
          </ul>
        </section>
      )}

      {/* Subscribed devices list */}
      <section className="mt-6">
        <p className="mb-2 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("notif.devices.title")}
        </p>
        {subs.length === 0 ? (
          <div className="mx-5 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-black/[0.04]">
            <p className="text-[13px] text-[var(--label-secondary)]">
              {t("notif.devices.empty")}
            </p>
          </div>
        ) : (
          <ul className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
            {subs.map((sub) => (
              <DeviceRow
                key={sub.id}
                sub={sub}
                isCurrent={sub.endpoint === currentEndpoint}
                onRemove={() => handleRemove(sub)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PrefRow({
  label,
  desc,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-black/[0.02] transition-colors [touch-action:manipulation]"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-[var(--foreground)]">{label}</p>
          <p className="mt-0.5 text-[12px] text-[var(--label-secondary)]">{desc}</p>
        </div>
        <span
          className={cn(
            "mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
            checked ? "bg-emerald-500 justify-end" : "bg-black/[0.12] justify-start"
          )}
        >
          <span className="m-0.5 h-5 w-5 rounded-full bg-white shadow-sm" />
        </span>
      </button>
    </li>
  );
}

function DeviceRow({
  sub,
  isCurrent,
  onRemove,
}: {
  sub: DbPushSubscription;
  isCurrent: boolean;
  onRemove: () => void;
}) {
  const t = useT();
  const parsed = parseUserAgent(sub.user_agent ?? undefined);
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[var(--foreground)]">
        <Smartphone className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-[var(--foreground)]">
          {parsed.label}
          {isCurrent && (
            <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              {t("notif.devices.current")}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[12px] text-[var(--label-secondary)]">
          {t("notif.devices.lastUsed")}{" "}
          {sub.last_used_at
            ? new Date(sub.last_used_at).toLocaleString()
            : t("notif.devices.never")}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("notif.devices.remove")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rose-600 active:bg-rose-50 [touch-action:manipulation]"
      >
        <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    </li>
  );
}
