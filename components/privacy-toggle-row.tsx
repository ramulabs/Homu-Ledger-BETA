"use client";

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { readHideAmountsPref, writeHideAmountsPref } from "@/lib/privacy";

/**
 * Inline iOS-style switch row for "Hide amounts on home screen".
 * Renders inside the Settings page's Account section — no navigation, just
 * tap to flip. The Settings page is a server component; this is the only
 * interactive row in the list, so it lives in its own client island.
 *
 * Initial state matches the bootstrap default (privacy ON for everyone),
 * then reconciles with the persisted preference after mount. Because the
 * underlying mask is driven by `<html data-hide-amounts>` set before paint,
 * the brief mount-time reconciliation only affects this switch thumb — the
 * home-screen totals are already showing the correct state.
 */
export default function PrivacyToggleRow() {
  const t = useT();
  const [hide, setHide] = useState(true);

  useEffect(() => {
    setHide(readHideAmountsPref());
  }, []);

  function onToggle() {
    const next = !hide;
    setHide(next);
    writeHideAmountsPref(next);
  }

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={hide}
        className="flex w-full items-center gap-3 px-4 py-3.5 min-h-[52px] text-left active:bg-black/[0.02] transition-colors [touch-action:manipulation]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.04] text-[var(--foreground)]">
          <EyeOff className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <p className="flex-1 text-[15px] font-medium text-[var(--foreground)]">
          {t("settings.privacy.hideHome")}
        </p>
        <SwitchThumb on={hide} />
      </button>
    </li>
  );
}

function SwitchThumb({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors " +
        (on ? "bg-[var(--accent,#22c55e)]" : "bg-black/[0.12]")
      }
    >
      <span
        className={
          "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.15)] transition-transform " +
          (on ? "translate-x-[22px]" : "translate-x-[2px]")
        }
      />
    </span>
  );
}
