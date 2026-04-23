import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditProfileShell from "@/components/edit-profile-shell";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, initials, avatar_color, username, email")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <EditProfileShell
      profile={{
        name: profile.name ?? "",
        username: profile.username ?? null,
        initials: profile.initials ?? "",
        avatar_color: profile.avatar_color ?? "#f97316",
        email: profile.email ?? user.email ?? "",
      }}
    />
  );
}
