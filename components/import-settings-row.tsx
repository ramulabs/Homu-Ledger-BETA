"use client";

// RAM-26 — A settings row that opens the ImportWizard bottom sheet.
// It's a client component so it can hold open/close state and pass
// wallets + categories (fetched server-side) down into the wizard.

import { useState } from "react";
import { Upload } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import ImportWizard from "@/components/import-wizard";
import type { DbCategory, DbWallet } from "@/lib/types";

type Props = {
  wallets: DbWallet[];
  categories: DbCategory[];
};

export default function ImportSettingsRow({ wallets, categories }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <li>
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 min-h-[52px] active:bg-black/[0.02] transition-colors [touch-action:manipulation]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.04] text-[var(--foreground)]">
            <Upload className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <p className="flex-1 text-left text-[15px] font-medium text-[var(--foreground)]">
            {t("import.settingsLabel")}
          </p>
          <ChevronRight className="h-[18px] w-[18px] text-[var(--label-tertiary)]" strokeWidth={2} />
        </button>
      </li>

      <ImportWizard
        open={open}
        onClose={() => setOpen(false)}
        wallets={wallets}
        categories={categories}
      />
    </>
  );
}
