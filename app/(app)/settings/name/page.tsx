import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LedgerNameShell from "./shell";
import { getServerT } from "@/lib/i18n/server";

type Props = {
  searchParams: Promise<{ current?: string }>;
};

export default async function LedgerNamePage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const current = params.current ?? "";

  const { t } = await getServerT();

  return (
    <LedgerNameShell
      current={current}
      title={t("settings.ledgerName.title")}
      subtitle={t("settings.ledgerName.subtitle")}
      placeholder={t("settings.ledgerName.placeholder")}
      saveLabel={t("common.save")}
      savingLabel={t("common.saving")}
      backLabel={t("common.back")}
    />
  );
}
