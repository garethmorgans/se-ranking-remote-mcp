interface Env {
	OAUTH_KV: KVNamespace;
	MCP_OBJECT: DurableObjectNamespace<import("./index").MyMCP>;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	ALLOWED_EMAIL_DOMAIN?: string;
	HOSTED_DOMAIN?: string;
	DATA_API_TOKEN?: string;
	PROJECT_API_TOKEN?: string;
	DATA_API_BASE_URL?: string;
	PROJECT_API_BASE_URL?: string;
}
