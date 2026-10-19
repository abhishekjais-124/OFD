import crypto from "node:crypto";
import { DriveError } from "./types.ts";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface TokenProvider {
  /** Returns a valid bearer token, refreshing when needed. */
  token(): Promise<string>;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function exchange(body: Record<string, string>, fetchImpl: typeof fetch): Promise<CachedToken> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (err) {
    throw new DriveError("network", `could not reach Google's token endpoint: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new DriveError("no_access", `Google rejected the credentials: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim(), false);
  }
  return { value: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000 };
}

/** Service account: signs a JWT with the private key and swaps it for an access token. */
export function serviceAccountTokens(jsonKey: string, fetchImpl: typeof fetch = fetch): TokenProvider {
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(jsonKey);
  } catch {
    throw new DriveError("not_configured", "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON", false);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new DriveError("not_configured", "service account JSON needs client_email and private_key", false);
  }
  const { client_email: email, private_key: key } = parsed;
  let cached: CachedToken | null = null;
  return {
    async token() {
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const now = Math.floor(Date.now() / 1000);
      const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
      const claims = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
      const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), key);
      const assertion = `${header}.${claims}.${b64url(signature)}`;
      cached = await exchange({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }, fetchImpl);
      return cached.value;
    },
  };
}

/** OAuth desktop app with a long-lived refresh token (see scripts/drive-auth.mjs). */
export function oauthTokens(
  creds: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): TokenProvider {
  let cached: CachedToken | null = null;
  return {
    async token() {
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      cached = await exchange(
        {
          grant_type: "refresh_token",
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: creds.refreshToken,
        },
        fetchImpl,
      );
      return cached.value;
    },
  };
}
