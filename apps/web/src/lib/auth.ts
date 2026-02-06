const TOKEN_STORAGE_KEY = "ceuplanner.auth.tokens.v1";
const LOGIN_STATE_KEY = "ceuplanner.auth.state";
const LOGIN_VERIFIER_KEY = "ceuplanner.auth.code_verifier";
const LOGIN_RETURN_TO_KEY = "ceuplanner.auth.return_to";

export type AuthTokens = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt: number;
};

type CognitoAuthConfig = {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  scope: string;
};

function normalizeDomain(raw: string): string {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getAuthConfig(): CognitoAuthConfig | null {
  const rawDomain = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!rawDomain || !clientId) {
    return null;
  }

  const domain = normalizeDomain(rawDomain);
  const origin = window.location.origin;

  return {
    domain,
    clientId,
    redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI || `${origin}/auth/callback`,
    logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI || origin,
    scope: import.meta.env.VITE_COGNITO_SCOPE || "openid email profile",
  };
}

export function isAuthConfigured(): boolean {
  return Boolean(getAuthConfig());
}

function randomString(length = 64): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let output = "";
  for (let i = 0; i < randomValues.length; i += 1) {
    output += charset[randomValues[i] % charset.length];
  }
  return output;
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createPkceChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

function parseStoredTokens(): AuthTokens | null {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AuthTokens>;
    if (!parsed.accessToken || !parsed.expiresAt) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      idToken: parsed.idToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function hasAnyStoredSession(): boolean {
  const tokens = parseStoredTokens();
  if (!tokens) {
    return false;
  }
  return Boolean(tokens.accessToken || tokens.refreshToken);
}

function isTokenFresh(tokens: AuthTokens): boolean {
  return tokens.expiresAt > Date.now() + 30_000;
}

function buildAuthorizeUrl(config: CognitoAuthConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return `https://${config.domain}/oauth2/authorize?${params.toString()}`;
}

export async function beginLogin(returnTo?: string): Promise<never> {
  const config = getAuthConfig();
  if (!config) {
    throw new Error("Authentication is not configured");
  }

  const codeVerifier = randomString(96);
  const state = randomString(48);
  const challenge = await createPkceChallenge(codeVerifier);

  sessionStorage.setItem(LOGIN_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(LOGIN_STATE_KEY, state);
  sessionStorage.setItem(
    LOGIN_RETURN_TO_KEY,
    returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`
  );

  window.location.assign(buildAuthorizeUrl(config, state, challenge));
  return new Promise<never>(() => {
    // Never resolves because browser navigates away.
  });
}

async function exchangeCodeForTokens(code: string, verifier: string): Promise<AuthTokens> {
  const config = getAuthConfig();
  if (!config) {
    throw new Error("Authentication is not configured");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(`https://${config.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error("Sign-in token exchange failed");
  }

  const payload = (await response.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const expiresIn = payload.expires_in ?? 3600;
  return {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function completeAuthCallback(url: string): Promise<string> {
  const callbackUrl = new URL(url);
  const callbackError = callbackUrl.searchParams.get("error");
  if (callbackError) {
    clearStoredTokens();
    throw new Error("Sign-in failed");
  }
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const storedState = sessionStorage.getItem(LOGIN_STATE_KEY);
  const verifier = sessionStorage.getItem(LOGIN_VERIFIER_KEY);
  const returnTo = sessionStorage.getItem(LOGIN_RETURN_TO_KEY) || "/dashboard";

  sessionStorage.removeItem(LOGIN_STATE_KEY);
  sessionStorage.removeItem(LOGIN_VERIFIER_KEY);
  sessionStorage.removeItem(LOGIN_RETURN_TO_KEY);

  if (!code || !state || !storedState || state !== storedState || !verifier) {
    throw new Error("Invalid sign-in response");
  }

  const tokens = await exchangeCodeForTokens(code, verifier);
  storeTokens(tokens);
  return returnTo;
}

export async function refreshAccessToken(): Promise<boolean> {
  const config = getAuthConfig();
  const tokens = parseStoredTokens();
  if (!config || !tokens?.refreshToken) {
    return false;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: tokens.refreshToken,
  });

  const response = await fetch(`https://${config.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    clearStoredTokens();
    return false;
  }

  const payload = (await response.json()) as {
    access_token: string;
    id_token?: string;
    expires_in?: number;
  };

  storeTokens({
    accessToken: payload.access_token,
    idToken: payload.id_token ?? tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });
  return true;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = parseStoredTokens();
  if (!tokens) {
    return null;
  }

  if (isTokenFresh(tokens)) {
    return tokens.accessToken;
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    return null;
  }

  return parseStoredTokens()?.accessToken ?? null;
}

export function buildLogoutUrl(): string | null {
  const config = getAuthConfig();
  if (!config) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  return `https://${config.domain}/logout?${params.toString()}`;
}

export function logout(): void {
  clearStoredTokens();
  const logoutUrl = buildLogoutUrl();
  if (!logoutUrl) {
    window.location.assign("/");
    return;
  }
  window.location.assign(logoutUrl);
}
