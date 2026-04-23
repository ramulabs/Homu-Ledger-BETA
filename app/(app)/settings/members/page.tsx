import { redirect } from "next/navigation";
import { ChevronLeft, Crown } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, household_id")
    .eq("id", user.id)
    .single();

  const { data: household } = profile?.household_id
    ? await supabase
        .from("households")
        .select("id, name, owner_id")
        .eq("id", profile.household_id)
        .single()
    : { data: null };

  if (!household) redirect("/settings");

  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, initials, avatar_color")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  return (
    <div className="pb-10">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <Link
          href="/settings"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </Link>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">Members</h1>
        <div className="h-9 w-9" />
      </header>

      <p className="mb-2 mt-5 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
        {household.name}
      </p>

      <div className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04]">
        {(members ?? []).map((m: any) => {
          const isOwner = m.id === household.owner_id;
          const isMe = m.id === user.id;
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 border-b border-[var(--separator)] px-4 py-3.5 last:border-0"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
                style={{ backgroundColor: m.avatar_color }}
              >
                {m.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-[var(--foreground)]">
                  {m.name}
                  {isMe && (
                    <span className="ml-1.5 text-[12px] text-[var(--label-tertiary)]">(you)</span>
                  )}
                </p>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ backgroundColor: isOwner ? "#fef3c7" : "#f3f4f6" }}
              >
                {isOwner && <Crown className="h-3 w-3 text-amber-600" strokeWidth={2.25} />}
                <span className={`text-[11px] font-semibold ${isOwner ? "text-amber-700" : "text-[var(--label-secondary)]"}`}>
                  {isOwner ? "Owner" : "Member"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
