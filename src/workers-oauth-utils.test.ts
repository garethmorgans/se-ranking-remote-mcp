import { describe, expect, it } from "vitest";
import {
	OAuthError,
	bindStateToSession,
	createOAuthState,
	validateOAuthState,
} from "./workers-oauth-utils";

function createMockKv() {
	const store = new Map<string, string>();

	return {
		kv: {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value);
			},
			delete: async (key: string) => {
				store.delete(key);
			},
		} as unknown as KVNamespace,
		store,
	};
}

describe("workers-oauth-utils state validation", () => {
	it("rejects missing state", async () => {
		const { kv } = createMockKv();
		await expect(validateOAuthState(new Request("https://example.com/callback"), kv)).rejects.toMatchObject(
			{
				code: "invalid_request",
				description: "Missing state parameter",
			},
		);
	});

	it("rejects invalid or expired state", async () => {
		const { kv } = createMockKv();
		const req = new Request("https://example.com/callback?state=missing");
		await expect(validateOAuthState(req, kv)).rejects.toMatchObject({
			code: "invalid_request",
			description: "Invalid or expired state",
		});
	});

	it("rejects missing session binding cookie", async () => {
		const { kv } = createMockKv();
		const { stateToken } = await createOAuthState({ clientId: "abc" } as any, kv);
		const req = new Request(`https://example.com/callback?state=${stateToken}`);
		await expect(validateOAuthState(req, kv)).rejects.toMatchObject({
			code: "invalid_request",
			description: "Missing session binding cookie - restart authorization flow",
		});
	});

	it("rejects mismatched session cookie hash", async () => {
		const { kv } = createMockKv();
		const { stateToken } = await createOAuthState({ clientId: "abc" } as any, kv);
		const req = new Request(`https://example.com/callback?state=${stateToken}`, {
			headers: { Cookie: "__Host-CONSENTED_STATE=invalidhash" },
		});
		await expect(validateOAuthState(req, kv)).rejects.toMatchObject({
			code: "invalid_request",
			description: "State token does not match session",
		});
	});

	it("accepts valid state and cookie, then clears one-time state", async () => {
		const { kv, store } = createMockKv();
		const { stateToken } = await createOAuthState({ clientId: "abc", scope: "read" } as any, kv);
		const { setCookie } = await bindStateToSession(stateToken);
		const cookieValue = setCookie.split(";")[0];
		const req = new Request(`https://example.com/callback?state=${stateToken}`, {
			headers: { Cookie: cookieValue },
		});

		const result = await validateOAuthState(req, kv);
		expect(result.oauthReqInfo).toMatchObject({ clientId: "abc", scope: "read" });
		expect(result.clearCookie).toContain("__Host-CONSENTED_STATE=");
		expect(store.has(`oauth:state:${stateToken}`)).toBe(false);
	});

	it("OAuthError serializes into oauth style response", async () => {
		const error = new OAuthError("invalid_request", "Bad input", 400);
		const response = error.toResponse();
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "invalid_request",
			error_description: "Bad input",
		});
	});
});
