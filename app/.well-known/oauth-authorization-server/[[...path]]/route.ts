// Compatibility shim for MCP clients that predate Protected Resource
// Metadata and look for authorization-server metadata on the MCP host
// itself. Spec-following clients go via /.well-known/oauth-protected-resource
// straight to Supabase and never hit this. Proxies Supabase Auth's RFC 8414
// metadata unchanged.

import { metadataCorsOptionsRequestHandler } from "mcp-handler";

const UPSTREAM = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`;

export async function GET() {
  const res = await fetch(UPSTREAM, { next: { revalidate: 3600 } });
  if (!res.ok) {
    return Response.json({ error: "authorization_server_unavailable" }, { status: 502 });
  }
  return Response.json(await res.json(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
