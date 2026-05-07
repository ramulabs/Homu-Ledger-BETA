"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import type { SubscriptionTier } from "@/lib/types";

/**
 * Celebrates a user's first sign-in after redeeming a promo code.
 *
 * Mounts on the onboarding page (and anywhere else the user might land
 * post-signup). Triggered by `?welcome=1` in the URL — strips the param
 * after dismissal so it only shows once.
 *
 * Reads the user's `subscription_tier` from their profile via the browser
 * Supabase client (no extra server roundtrip needed since the user is
 * already authenticated and RLS lets them read their own row).
 */
export default function WelcomeProModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;

    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      const t = profile?.subscription_tier as SubscriptionTier | null;
      if (t) {
        setTier(t);
        setOpen(true);
        // Slide-in animation next paint
        requestAnimationFrame(() => setVisible(true));
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  function handleClose() {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      // Strip ?welcome=1 so the modal doesn't re-fire on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      router.replace(url.pathname + (url.search || ""));
    }, 200);
  }

  if (!open || !tier) return null;

  const tierLabel = t(`promo.tier.${tier}` as any);
  const body = t("promo.welcomeBody").replace("{tier}", tierLabel);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[200] bg-black/50 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleClose}
      />
      <div
        className={cn(
          "fixed inset-x-5 top-1/2 z-[210] mx-auto max-w-sm -translate-y-1/2 rounded-3xl bg-[var(--surface)] p-6 shadow-2xl ring-1 ring-black/[0.05] transition-all duration-300",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
      >
        <button
          onClick={handleClose}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)]"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>

        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-rose-100">
            <Sparkles className="h-10 w-10 text-[#EE6452]" strokeWidth={2} />
            {/* Tiny celebratory dots */}
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400" />
            <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full bg-emerald-400" />
            <span className="absolute -top-2 left-2 h-1.5 w-1.5 rounded-full bg-blue-400" />
          </div>

          <h2 className="text-[22px] font-bold tracking-tight text-[var(--foreground)]">
            {t("promo.welcomeTitle")}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--label-secondary)]">
            {body}
          </p>

          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#EE6452]/10 px-3 py-1 text-[12px] font-semibold text-[#EE6452]">
            <Sparkles className="h-3 w-3" strokeWidth={2.5} />
            {tierLabel.toUpperCase()}
          </div>

          <button
            onClick={handleClose}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[#EE6452] text-[15px] font-semibold text-white shadow-sm active:scale-[0.99] transition-transform"
          >
            {t("promo.welcomeContinue")}
          </button>
        </div>
      </div>
    </>
  );
}
