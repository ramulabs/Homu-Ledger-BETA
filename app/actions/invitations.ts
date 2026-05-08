"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite a user to the current household by email or username.
 * Looks up the existing profile and creates a pending invitation.
 */
export async function inviteMember(emailOrUsername: string): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = emailOrUsername.trim();
  if (!trimmed) return { error: "Email or username required" };

  // Get current household
  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No active ledger" };

  // Resolve invitee via SECURITY DEFINER RPC (RLS on profiles only allows reading
  // same-household members, so a direct query can't find users outside the ledger)
  const isEmail = trimmed.includes("@");
  const { data: rpcRows, error: lookupError } = await supabase
    .rpc("lookup_user_for_invite", { p_query: trimmed });

  if (lookupError) return { error: lookupError.message };

  const invitee = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!invitee) {
    return { error: `No user found with that ${isEmail ? "email" : "username"}.` };
  }

  if (invitee.id === user.id) {
    return { error: "You can't invite yourself." };
  }

  // Already a member?
  const { data: existingMember } = await supabase
    .from("household_members")
    .select("profile_id")
    .eq("household_id", profile.household_id)
    .eq("profile_id", invitee.id)
    .maybeSingle();

  if (existingMember) return { error: `${invitee.name} is already a member.` };

  // Pending invite already?
  const { data: existingInvite } = await supabase
    .from("household_invitations")
    .select("id")
    .eq("household_id", profile.household_id)
    .eq("invited_user_id", invitee.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) return { error: `${invitee.name} already has a pending invitation.` };

  const { error } = await supabase.from("household_invitations").insert({
    household_id: profile.household_id,
    invited_by: user.id,
    invited_user_id: invitee.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/members");
  return { success: `Invitation sent to ${invitee.name}.` };
}

/**
 * Accept a pending invitation. Adds the user to household_members and switches them in.
 */
export async function acceptInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Migration 0011 moved the accept flow into a SECURITY DEFINER RPC that
  // also verifies the inviter is still a member of the household (auto-
  // declining stale invites from removed members), inserts membership,
  // and switches the user into the new ledger atomically.
  const { error } = await supabase.rpc("accept_household_invitation", { p_invitation_id: invitationId });
  if (error) return { error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/reports");
  revalidatePath("/settings");
  revalidatePath("/settings/members");
  return {};
}

/**
 * Decline a pending invitation.
 */
export async function declineInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invite } = await supabase
    .from("household_invitations")
    .select("id, invited_user_id, status")
    .eq("id", invitationId)
    .single();

  if (!invite) return { error: "Invitation not found" };
  if (invite.invited_user_id !== user.id) return { error: "Not your invitation" };
  if (invite.status !== "pending") return { error: "Invitation is no longer pending" };

  const { error } = await supabase
    .from("household_invitations")
    .update({ status: "declined" })
    .eq("id", invitationId);

  if (error) return { error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/settings/members");
  return {};
}

/**
 * Cancel a pending invitation (inviter or household owner).
 */
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", invitationId);

  if (error) return { error: error.message };

  revalidatePath("/settings/members");
  return {};
}

/**
 * Join a ledger using its 6-character invite code.
 * Mirrors the join flow from auth.ts but for already-authenticated users in the app.
 */
export async function joinLedgerByCode(code: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { error: "Invite code required" };

  // Migration 0011 locked down household_members INSERT to owners only;
  // joins must go through the SECURITY DEFINER RPC.
  const { error } = await supabase.rpc("join_household_by_invite_code", { p_code: trimmed });
  if (error) return { error: "Invalid invite code." };

  revalidatePath("/transactions");
  revalidatePath("/reports");
  revalidatePath("/settings");
  return {};
}
