# SE Ranking MCP on Cloudflare Workers (Google OAuth Protected)

Cloudflare Workers-hosted MCP server for SE Ranking Data + Project APIs with Google OAuth-gated access.

## OAuth route model

The worker exposes the same OAuth access model as your Google Analytics MCP server:

- `/authorize`
- `/token`
- `/register`
- `/callback`
- `/mcp` (protected behind OAuthProvider)

OAuth state is stored in KV (`OAUTH_KV`) and bound to a secure cookie (`__Host-CONSENTED_STATE`). Callback validation fails closed if state/cookie checks fail.

## What it exposes

Service tools are unchanged and available after OAuth authorization:

- Keyword research (`keyword_export_metrics`, `keyword_related`, `keyword_similar`)
- Domain analysis (`domain_overview`, `domain_keywords`, `domain_keyword_comparison`, `domain_competitors`)
- Backlinks (`backlinks_summary`, `backlinks_list`, `referring_domains`)
- AI search (`ai_search_overview`, `ai_search_leaderboard`, `ai_overview_keywords_by_target`)
- Project/rank tracking (`project_list`, `project_add`, `project_keywords_list`, `project_run_position_check`)
- Website audit (`audit_create`, `audit_status`, `audit_list`, `audit_report`)

## Prerequisites

- Cloudflare account + Wrangler auth
- Node.js 20+
- SE Ranking Data API token
- SE Ranking Project API token
- Google OAuth 2.0 credentials (web app client)

## Step-by-step credential setup

### 1) Create Google OAuth credentials

1. Open Google Cloud Console -> APIs & Services -> Credentials.
2. Configure OAuth consent screen (internal or external based on your org policy).
3. Create OAuth Client ID of type **Web application**.
4. Add authorized redirect URIs:
   - Local: `http://localhost:8787/callback`
   - Production: `https://<your-worker>.<your-subdomain>.workers.dev/callback`

Important: use `/callback` as redirect URI. Do **not** use `/mcp`.

### 2) Create Cloudflare KV for OAuth state

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned namespace ID and place it in `wrangler.jsonc` under `kv_namespaces[].id`.

### 3) Set Worker secrets

Local/dev secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DATA_API_TOKEN
npx wrangler secret put PROJECT_API_TOKEN
```

Optional secrets:

```bash
npx wrangler secret put ALLOWED_EMAIL_DOMAIN
npx wrangler secret put HOSTED_DOMAIN
```

- `ALLOWED_EMAIL_DOMAIN` defaults to `herdl.com` if omitted.
- `HOSTED_DOMAIN` is a Google account chooser hint (`hd`), not the enforcement control.

Optional non-secret overrides:

- `DATA_API_BASE_URL` (default: `https://api.seranking.com`)
- `PROJECT_API_BASE_URL` (default: `https://api4.seranking.com`)

## Run locally

```bash
npm install
npm run dev
```

Local OAuth callback URL:

- `http://localhost:8787/callback`

Local MCP endpoint:

- `http://localhost:8787/mcp`

## Deploy to Cloudflare Workers

Set production secrets (same keys as local) and deploy:

```bash
npm run deploy
```

Production callback URL:

- `https://<your-worker>.<your-subdomain>.workers.dev/callback`

Production MCP endpoint:

- `https://<your-worker>.<your-subdomain>.workers.dev/mcp`

## Local test flow with MCP Inspector

1. Start worker locally: `npm run dev`
2. Open MCP Inspector.
3. Connect to `http://localhost:8787/mcp`.
4. Complete OAuth login (redirects through `/authorize` -> Google -> `/callback`).
5. After callback success, invoke SE Ranking tools from the inspector.

## Client configuration example (Claude Desktop via mcp-remote)

```json
{
  "mcpServers": {
    "se-ranking-cloudflare": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-worker>.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

## Security model summary

- KV-backed one-time OAuth state with TTL.
- Secure cookie-to-state hash binding.
- Domain allowlist with default `herdl.com`, configurable via `ALLOWED_EMAIL_DOMAIN`.
- Fail-closed on invalid/missing state, missing cookie, hash mismatch, or unauthorized domain.

## References

- [SE Ranking MCP guide](https://seranking.com/api/integrations/mcp/)
- [SE Ranking API docs](https://seranking.com/api/)
