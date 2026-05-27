// POST /api/push/resubscribe — RAM-9.
//
// Service worker calls this from its `pushsubscriptionchange` handler
// when the browser invalidates the current PushSubscription (auth keys
// rotated, push service migrated, etc.) and hands us a fresh one. We
// take the old endpoint as a hint to find the existing row and update
// it in place; if no match (clean install, manual reset) we fall back
// to a plain upsert that the regular subscribe flow would do.
//
// This runs inside the user's authenticated session (the SW shares
// cookies with the page) so RLS lets it touch its own row.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  oldEndpoint: string | null;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  } | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Missing subscription fields" }, { status: 400 });
  }

  // If we know the old endpoint, update in place — preserves the row's
  // prefs and metadata. Otherwise upsert by (provider, endpoint).
  if (body.oldEndpoint) {
    const { error: updateErr } = await supabase
      .from("push_subscriptions")
      .update({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        enabled: true,
        last_used_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", "web")
      .eq("endpoint", body.oldEndpoint);
    // We don't fail if 0 rows matched — fall through to upsert.
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  const { error: upsertErr } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        provider: "web",
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        enabled: true,
      },
      { onConflict: "provider,endpoint" }
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
