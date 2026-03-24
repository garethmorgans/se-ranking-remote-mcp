import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GoogleHandler } from "./google-handler";

type TokenType = "data" | "project";

type WorkerEnv = Env & {
	DATA_API_TOKEN?: string;
	PROJECT_API_TOKEN?: string;
	DATA_API_BASE_URL?: string;
	PROJECT_API_BASE_URL?: string;
};

type RequestOptions = {
	tokenType: TokenType;
	baseUrl: string;
	path: string;
	query?: Record<string, string | number | boolean | undefined>;
	method?: "GET" | "POST";
	jsonBody?: unknown;
	formBody?: Record<string, string | number | Array<string | number> | undefined>;
};

const DEFAULT_DATA_API_BASE_URL = "https://api.seranking.com";
const DEFAULT_PROJECT_API_BASE_URL = "https://api4.seranking.com";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

function toTextResult(payload: unknown) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(payload, null, 2),
			},
		],
	};
}

function clampLimit(limit: number | undefined) {
	if (!limit) return DEFAULT_PAGE_LIMIT;
	return Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "SE Ranking MCP",
		version: "1.0.0",
	});

	private getToken(env: WorkerEnv, tokenType: TokenType): string {
		const token = tokenType === "data" ? env.DATA_API_TOKEN : env.PROJECT_API_TOKEN;
		if (!token) {
			throw new Error(
				`Missing ${tokenType === "data" ? "DATA_API_TOKEN" : "PROJECT_API_TOKEN"} secret`,
			);
		}
		return token;
	}

	private buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
		const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined) {
					url.searchParams.set(key, String(value));
				}
			}
		}
		return url.toString();
	}

	private async request(env: WorkerEnv, options: RequestOptions): Promise<unknown> {
		const token = this.getToken(env, options.tokenType);
		const url = this.buildUrl(options.baseUrl, options.path, options.query);
		const method = options.method ?? "GET";
		const headers = new Headers({
			Authorization: `Token ${token}`,
		});
		let body: BodyInit | undefined;

		if (options.jsonBody !== undefined) {
			headers.set("Content-Type", "application/json");
			body = JSON.stringify(options.jsonBody);
		} else if (options.formBody !== undefined) {
			const form = new FormData();
			for (const [key, value] of Object.entries(options.formBody)) {
				if (value === undefined) continue;
				if (Array.isArray(value)) {
					for (const item of value) {
						form.append(key, String(item));
					}
				} else {
					form.append(key, String(value));
				}
			}
			body = form;
		}

		const response = await fetch(url, { method, headers, body });
		const contentType = response.headers.get("content-type") ?? "";
		const payload =
			contentType.includes("application/json") ? await response.json() : await response.text();
		if (!response.ok) {
			throw new Error(
				`SE Ranking API error (${response.status}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`,
			);
		}
		return payload;
	}

	async init() {
		const env = this.env as WorkerEnv;
		const dataBaseUrl = env.DATA_API_BASE_URL ?? DEFAULT_DATA_API_BASE_URL;
		const projectBaseUrl = env.PROJECT_API_BASE_URL ?? DEFAULT_PROJECT_API_BASE_URL;

		// Keyword research
		this.server.tool(
			"keyword_export_metrics",
			{
				source: z.string().default("us"),
				keywords: z.array(z.string()).min(1).max(100),
				sort: z.string().optional(),
				sort_order: z.enum(["asc", "desc"]).optional(),
				cols: z.string().optional(),
			},
			async ({ source, keywords, sort, sort_order, cols }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/keywords/export",
					query: { source },
					method: "POST",
					formBody: { "keywords[]": keywords, sort, sort_order, cols },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"keyword_related",
			{
				keyword: z.string(),
				source: z.string().default("us"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			},
			async ({ keyword, source, limit }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/keywords/related",
					query: { keyword, source, limit: clampLimit(limit) },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"keyword_similar",
			{
				keyword: z.string(),
				source: z.string().default("us"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			},
			async ({ keyword, source, limit }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/keywords/similar",
					query: { keyword, source, limit: clampLimit(limit) },
				});
				return toTextResult(payload);
			},
		);

		// Domain analysis
		this.server.tool(
			"domain_overview",
			{
				domain: z.string(),
				source: z.string().default("us"),
				with_subdomains: z.boolean().default(true),
			},
			async ({ domain, source, with_subdomains }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/domain/overview/db",
					query: { domain, source, with_subdomains: with_subdomains ? 1 : 0 },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"domain_keywords",
			{
				domain: z.string(),
				source: z.string().default("us"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
				offset: z.number().int().min(0).optional(),
			},
			async ({ domain, source, limit, offset }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/domain/keywords",
					query: { domain, source, limit: clampLimit(limit), offset: offset ?? 0 },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"domain_keyword_comparison",
			{
				domain: z.string(),
				compare: z.string(),
				source: z.string().default("us"),
				type: z.enum(["common", "gap"]).default("common"),
			},
			async ({ domain, compare, source, type }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/domain/keywords/comparison",
					query: { domain, compare, source, type },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"domain_competitors",
			{
				domain: z.string(),
				source: z.string().default("us"),
				type: z.enum(["organic", "paid"]).default("organic"),
			},
			async ({ domain, source, type }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/domain/competitors",
					query: { domain, source, type },
				});
				return toTextResult(payload);
			},
		);

		// Backlinks
		this.server.tool(
			"backlinks_summary",
			{
				target: z.string(),
				mode: z.enum(["domain", "host", "url"]).default("domain"),
			},
			async ({ target, mode }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/backlinks/summary",
					query: { target, mode, output: "json" },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"backlinks_list",
			{
				target: z.string(),
				mode: z.enum(["domain", "host", "url"]).default("domain"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
				order_by: z.string().optional(),
				per_domain: z.union([z.literal(0), z.literal(1)]).default(0),
			},
			async ({ target, mode, limit, order_by, per_domain }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/backlinks/all",
					query: {
						target,
						mode,
						limit: clampLimit(limit),
						order_by,
						per_domain,
						output: "json",
					},
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"referring_domains",
			{
				target: z.string(),
				mode: z.enum(["domain", "host", "url"]).default("domain"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			},
			async ({ target, mode, limit }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/backlinks/refdomains",
					query: { target, mode, limit: clampLimit(limit), output: "json" },
				});
				return toTextResult(payload);
			},
		);

		// AI search
		this.server.tool(
			"ai_search_overview",
			{
				engine: z.enum(["ai-overview", "chatgpt", "perplexity", "gemini", "ai-mode"]),
				target: z.string(),
				source: z.string().default("us"),
				scope: z.enum(["base_domain", "domain", "url"]).default("domain"),
			},
			async ({ engine, target, source, scope }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/ai-search/overview",
					query: { engine, target, source, scope },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"ai_search_leaderboard",
			{
				engine: z.enum(["ai-overview", "chatgpt", "perplexity", "gemini", "ai-mode"]),
				source: z.string().default("us"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			},
			async ({ engine, source, limit }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/ai-search/leaderboard",
					query: { engine, source, limit: clampLimit(limit) },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"ai_overview_keywords_by_target",
			{
				target: z.string(),
				scope: z.enum(["domain", "url"]).default("domain"),
				source: z.string().default("us"),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			},
			async ({ target, scope, source, limit }) => {
				const payload = await this.request(env, {
					tokenType: "data",
					baseUrl: dataBaseUrl,
					path: "/v1/domain/aio/keywords-by-target",
					query: { target, scope, source, limit: clampLimit(limit) },
				});
				return toTextResult(payload);
			},
		);

		// Project/rank tracking
		this.server.tool("project_list", {}, async () => {
			const payload = await this.request(env, {
				tokenType: "project",
				baseUrl: projectBaseUrl,
				path: "/sites",
			});
			return toTextResult(payload);
		});

		this.server.tool(
			"project_add",
			{
				name: z.string(),
				group_id: z.number().int().optional(),
				url: z.string(),
			},
			async ({ name, group_id, url }) => {
				const payload = await this.request(env, {
					tokenType: "project",
					baseUrl: projectBaseUrl,
					path: "/sites",
					method: "POST",
					jsonBody: [{ url, title: name, group_id }],
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"project_keywords_list",
			{
				site_id: z.number().int(),
				site_engine_id: z.number().int(),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			},
			async ({ site_id, site_engine_id, limit }) => {
				const payload = await this.request(env, {
					tokenType: "project",
					baseUrl: projectBaseUrl,
					path: `/sites/${site_id}/keywords`,
					query: { site_engine_id, limit: clampLimit(limit) },
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"project_run_position_check",
			{
				site_id: z.number().int(),
				keywords: z
					.array(
						z.object({
							site_engine_id: z.number().int(),
							keyword_id: z.number().int(),
						}),
					)
					.optional(),
			},
			async ({ site_id, keywords }) => {
				const payload = await this.request(env, {
					tokenType: "project",
					baseUrl: projectBaseUrl,
					path: `/api/sites/${site_id}/recheck/`,
					method: "POST",
					jsonBody: keywords?.length ? { keywords } : {},
				});
				return toTextResult(payload);
			},
		);

		// Website audit
		this.server.tool(
			"audit_create",
			{
				domain: z.string(),
				title: z.string(),
				max_pages: z.number().int().min(1).max(100000).default(1000),
			},
			async ({ domain, title, max_pages }) => {
				const payload = await this.request(env, {
					tokenType: "project",
					baseUrl: projectBaseUrl,
					path: "/audit/",
					method: "POST",
					jsonBody: {
						domain,
						title,
						settings: {
							max_pages,
							source_subdomain: 0,
						},
					},
				});
				return toTextResult(payload);
			},
		);

		this.server.tool(
			"audit_status",
			{
				audit_id: z.number().int(),
			},
			async ({ audit_id }) => {
				const payload = await this.request(env, {
					tokenType: "project",
					baseUrl: projectBaseUrl,
					path: `/audit/${audit_id}/status`,
				});
				return toTextResult(payload);
			},
		);

		this.server.tool("audit_list", {}, async () => {
			const payload = await this.request(env, {
				tokenType: "project",
				baseUrl: projectBaseUrl,
				path: "/audit/",
			});
			return toTextResult(payload);
		});

		this.server.tool(
			"audit_report",
			{
				audit_id: z.number().int(),
			},
			async ({ audit_id }) => {
				const payload = await this.request(env, {
					tokenType: "project",
					baseUrl: projectBaseUrl,
					path: `/audit/${audit_id}`,
				});
				return toTextResult(payload);
			},
		);
	}
}

export default new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: MyMCP.serve("/mcp"),
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
});
