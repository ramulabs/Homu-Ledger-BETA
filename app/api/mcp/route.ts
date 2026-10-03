// Homu MCP server — lets AI agents (Gemini Spark, Claude, …) read the ledger
// and add transactions on the user's behalf.
//
// Transport: Streamable HTTP via mcp-handler, which serves both the
// 2026-07-28 MCP spec and 2025-era clients from this one route.
// Auth: OAuth 2.1 with Supabase Auth as the authorization server. Unauthed
// requests get a 401 whose WWW-Authenticate header points clients at
// /.well-known/oauth-protected-resource, from which they discover Supabase,
// register (DCR), and send the user through /oauth/consent.

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerHomuTools, HOMU_INSTRUCTIONS } from "@/lib/mcp/tools";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { APP_VERSION } from "@/lib/version";

const handler = createMcpHandler((server) => registerHomuTools(server), {
  serverInfo: { name: "homu", version: APP_VERSION },
  instructions: HOMU_INSTRUCTIONS,
});

const authedHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
