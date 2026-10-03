"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { withTimeout } from "@/lib/with-timeout";

const STALE_REFRESH_KEY = "homu-stale-refresh";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await withTimeout(fetch("/api/version", { cache: "no-store" }), 8000);
    return res.ok;
  } catch {
    return false;
  }
}

export default function ServiceWorkerRegistrar() {
  const router = useRouter();

  // React is up: tell the boot guard (app/layout.tsx) and drop its
  // "Taking longer than usual" pill if it already appeared.
  useEffect(() => {
    (window as unknown as { __homuHydrated?: boolean }).__homuHydrated = true;
    document.getElementById("homu-watchdog")?.remove();
  }, []);

  // The service worker answered this page from cache because the network was
  // slow or down (sw.js marks it with data-homu-stale). Refresh the data once
  // the server is reachable. The reachability probe matters: router.refresh()
  // on a dead network makes Next fall back to a full reload, which would land
  // straight back on the stale copy. The 60s guard is a second backstop
  // against any refresh → reload → stale loop.
  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.homuStale !== "1") return;
    delete html.dataset.homuStale;
    try {
      const last = Number(sessionStorage.getItem(STALE_REFRESH_KEY)) || 0;
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(STALE_REFRESH_KEY, String(Date.now()));
    } catch {}

    let cancelled = false;
    async function refreshWhenReachable() {
      if (await serverReachable()) {
        if (!cancelled) router.refresh();
        return;
      }
      window.addEventListener("online", onOnline, { once: true });
    }
    function onOnline() {
      void refreshWhenReachable();
    }
    void refreshWhenReachable();
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // ── DEV MODE ──────────────────────────────────────────────────────
    // We deliberately do NOT register a service worker during local dev.
    // Reasons:
    //   1. The SW caches /_next/static/* with a cache-first strategy.
    //     In production those URLs are content-addressed (hash in the
    //     name) so new builds always miss the cache and fetch fresh.
    //   2. In dev, Webpack/Turbopack rewrites the SAME chunk URL many
    //     times per session as you edit. The SW happily serves the
    //     stale cached version, while the server renders fresh HTML
    //     against the new code → React hydration mismatch on every
    //     edit.
    // We also actively unregister any SW left over from a previous prod
    // visit on the same origin (e.g. localhost was once homu.ramu.app
    // in another tab) and nuke its caches, so a developer never has to
    // manually clear-site-data again.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      });
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})));
      }
      return;
    }

    // ── PRODUCTION ────────────────────────────────────────────────────
    let cancelled = false;

    // Kill-switch escape hatch. If we ever ship a broken sw.js that returns
    // wrong responses or never lets fetches reach the network, users are
    // stuck on the broken version forever (the SW intercepts the request
    // for the next sw.js too). Flip NEXT_PUBLIC_SW_KILL=1 in Vercel and
    // every client that reaches a page will self-heal on next load.
    fetch("/api/sw-kill-switch", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (cancelled || !data?.kill) return;
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
        }
        window.location.reload();
      })
      .catch(() => {});

    // If there's already a controller, a new SW taking over means an update.
    // Reload so the page gets fresh HTML + JS instead of showing stale content.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Explicitly check for a new SW on every page load (browser also checks
        // automatically, but this makes updates land faster after a deploy).
        reg.update().catch(() => {});
      })
      .catch((err) => console.warn("SW registration failed:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
