import { redirect } from "next/navigation";
import { Check, X } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";
import { decideAuthorization } from "./actions";

/**
 * OAuth 2.1 consent screen. Supabase Auth redirects here (Authentication →
 * OAuth Server → Authorization Path) when an MCP client such as Gemini
 * Spark asks to connect. Signed-out users are bounced through /login and
 * returned here by middleware (lib/auth/after-login.ts).
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; failed?: string }>;
}) {
  const { authorization_id: authorizationId, failed } = await searchParams;
  const { supabase, profile } = await requireSession();
  const { t } = await getServerT();

  const details = authorizationId
    ? await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
    : null;

  if (!details || details.error || !details.data) {
    return <Message title={t("oauth.title")} body={t("oauth.invalid")} />;
  }

  // Already approved earlier for these scopes — Supabase hands back the
  // client redirect directly.
  if (!("authorization_id" in details.data)) {
    redirect(details.data.redirect_url);
  }

  const auth = details.data;
  const { data: household } = profile?.household_id
    ? await supabase.from("households").select("name").eq("id", profile.household_id).maybeSingle()
    : { data: null };

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/homu-login.png" alt="Homu" className="mx-auto mb-5 h-24 w-24 object-contain" />
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("oauth.title")}
        </h1>
        <p className="mt-2 text-[15px] text-[var(--label-secondary)]">
          <span className="font-semibold text-[var(--foreground)]">{auth.client.name || "An app"}</span>{" "}
          {t("oauth.wantsAccess")}
        </p>
      </div>

      <div className="space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-black/[0.08]">
        <dl className="space-y-1 text-[13px]">
          {household?.name && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--label-secondary)]">{t("oauth.ledger")}</dt>
              <dd className="truncate font-medium text-[var(--foreground)]">{household.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--label-secondary)]">{t("oauth.signedInAs")}</dt>
            <dd className="truncate font-medium text-[var(--foreground)]">{auth.user.email}</dd>
          </div>
        </dl>

        <div className="border-t border-black/[0.06] pt-3">
          <p className="mb-2 text-[13px] font-medium text-[var(--label-secondary)]">{t("oauth.canDo")}</p>
          <ul className="space-y-2 text-[14px] text-[var(--foreground)]">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              {t("oauth.permRead")}
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              {t("oauth.permAdd")}
            </li>
            <li className="flex gap-2 text-[var(--label-secondary)]">
              <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t("oauth.cannot")}
            </li>
          </ul>
        </div>
      </div>

      {failed && (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">
          {t("oauth.failed")}
        </p>
      )}

      <form action={decideAuthorization} className="mt-5 space-y-2">
        <input type="hidden" name="authorization_id" value={auth.authorization_id} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#EE6452] text-[15px] font-semibold text-white shadow-sm active:opacity-90"
        >
          {t("oauth.allow")}
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-medium text-[var(--label-secondary)] active:opacity-70"
        >
          {t("oauth.deny")}
        </button>
      </form>

      <p className="mt-3 text-center text-[12px] text-[var(--label-tertiary)]">{t("oauth.revokeHint")}</p>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="w-full text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/homu-login.png" alt="Homu" className="mx-auto mb-5 h-24 w-24 object-contain" />
      <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
      <p className="mt-2 text-[14px] text-[var(--label-secondary)]">{body}</p>
    </div>
  );
}
