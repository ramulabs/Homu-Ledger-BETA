"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Approve or deny an OAuth authorization request (Supabase Auth OAuth 2.1
 * server), then send the browser back to the MCP client — Gemini Spark,
 * Claude, … — with the authorization code or an access_denied error.
 */
export async function decideAuthorization(formData: FormData) {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!authorizationId) redirect("/oauth/consent");

  const supabase = await createClient();
  const options = { skipBrowserRedirect: true };
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
    : await supabase.auth.oauth.denyAuthorization(authorizationId, options);

  if (error || !data?.redirect_url) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&failed=1`);
  }
  redirect(data.redirect_url);
}
