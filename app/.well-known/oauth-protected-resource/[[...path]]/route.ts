// RFC 9728 Protected Resource Metadata for the Homu MCP server.
// Served at /.well-known/oauth-protected-resource (what our 401 challenge
// advertises) and at the path-inserted form /.well-known/oauth-protected-
// resource/api/mcp that some clients probe. Tells clients that Supabase
// Auth is the authorization server for https://<host>/api/mcp.

import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { SUPABASE_AUTH_ISSUER } from "@/lib/mcp/auth";

export function GET(req: Request) {
  return protectedResourceHandler({
    authServerUrls: [SUPABASE_AUTH_ISSUER],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
