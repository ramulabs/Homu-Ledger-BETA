// Auth for the Homu MCP server (app/api/mcp).
//
// MCP clients (Gemini Spark, Claude, …) sign the user in through Supabase
// Auth's OAuth 2.1 server and send the resulting access token as a Bearer
// token. That token is an ordinary Supabase user JWT (plus a client_id
// claim), so a client built with it is scoped to that user and every query
// goes through the same Row Level Security as the app — the MCP server can
// only ever see the signed-in user's own household. No service-role key.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Database } from "@/lib/supabase/database.types";

/** Supabase Auth's OAuth issuer — what MCP clients discover and sign in with. */
export const SUPABASE_AUTH_ISSUER = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;

export function createUserClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * withMcpAuth verifier. getUser() asks Supabase Auth to validate the token
 * (rather than only checking the signature locally) so a revoked session —
 * e.g. signed out from Settings → Devices — stops working immediately, the
 * same reasoning as the app's middleware (v1.31.0).
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const supabase = createUserClient(bearerToken);
  const { data, error } = await supabase.auth.getUser(bearerToken);
  if (error || !data.user) return undefined;

  // Signature and expiry were just validated by getUser(); the payload is
  // only read for informational claims.
  const claims = jwtPayload(bearerToken);
  return {
    token: bearerToken,
    clientId: typeof claims.client_id === "string" ? claims.client_id : "homu",
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { userId: data.user.id },
  };
}
