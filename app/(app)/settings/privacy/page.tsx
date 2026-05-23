"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, EyeOff } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { readHideAmountsPref, writeHideAmountsPref } from "@/lib/privacy";

export default function PrivacyPage() {
  const t = useT();
  const router = useRouter();
  const [hide, setHide] = useState(false);

  // Seed from localStorage after mount — the <html data-hide-amounts> set by
  // the bootstrap script is what really drives the rendered state; this state
  // only powers the toggle UI on this page.
  useEffect(() => {
    setHide(readHideAmountsPref());
  }, []);

  function onToggle() {
    const next = !hide;
    setHide(next);
    writeHideAmountsPref(next);
  }

  return (
    <div className="pb-10">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-4 backdrop-blur">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("settings.privacy")}
        </h1>
        <div className="h-9 w-9" />
      </header>

      <p className="px-6 pb-4 text-[13px] text-[var(--label-secondary)]">
        {t("settings.privacy.subtitle")}
      </p>

      <ul className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04]">
        <li>
          <button
            onClick={onToggle}
            role="switch"
            aria-checked={hide}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-black/[0.02] transition-colors [touch-action:manipulation]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[var(--foreground)]">
              <EyeOff className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-[var(--foreground)]">
                {t("settings.privacy.hideHome")}
              </p>
              <p className="text-[12px] text-[var(--label-secondary)]">
                {t("settings.privacy.hideHome.desc")}
              </p>
            </div>
            <SwitchThumb on={hide} />
          </button>
        </li>
      </ul>
    </div>
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
