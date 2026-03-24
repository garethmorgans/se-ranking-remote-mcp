# SE Ranking MCP on Cloudflare Workers

Cloudflare Workers-hosted MCP server for SE Ranking Data + Project APIs. This repo is based on the Cloudflare remote MCP authless template and adapted to call SE Ranking directly (no Docker runtime required in production).

## What it exposes

The MCP server includes tools for:

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

## Local setup

Install dependencies:

```bash
npm install
```

Add local secrets:

```bash
npx wrangler secret put DATA_API_TOKEN
npx wrangler secret put PROJECT_API_TOKEN
```

Optional non-secret overrides:

- `DATA_API_BASE_URL` (default: `https://api.seranking.com`)
- `PROJECT_API_BASE_URL` (default: `https://api4.seranking.com`)

Run locally:

```bash
npm run dev
```

MCP endpoints:

- `http://localhost:8787/sse`
- `http://localhost:8787/mcp`

## Deploy to Cloudflare Workers

Set production secrets:

```bash
npx wrangler secret put DATA_API_TOKEN
npx wrangler secret put PROJECT_API_TOKEN
```

Deploy:

```bash
npm run deploy
```

Your remote MCP URL will be:

- `https://<your-worker>.<your-subdomain>.workers.dev/sse`

## Connect a client

### Claude Desktop (via `mcp-remote`)

```json
{
  "mcpServers": {
    "se-ranking-cloudflare": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-worker>.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

### Cloudflare AI Playground

1. Open [Cloudflare AI Playground](https://playground.ai.cloudflare.com/).
2. Add your MCP endpoint URL (`https://<your-worker>.<your-subdomain>.workers.dev/sse`).
3. Use the SE Ranking tools directly in the playground.

## Notes on tokens and tool scope

- Data tools require `DATA_API_TOKEN`.
- Project/audit tools require `PROJECT_API_TOKEN`.
- If a required token is missing, the relevant tool returns an explicit token error.

## References

- [SE Ranking MCP guide](https://seranking.com/api/integrations/mcp/)
- [SE Ranking API docs](https://seranking.com/api/)
