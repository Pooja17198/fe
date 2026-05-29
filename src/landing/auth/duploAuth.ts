type DuploFetchApi = (input: string | Request, init?: RequestInit) => Promise<Response>;

type DuploTokenAuthenticator = {
  getFetchApi?: () => DuploFetchApi;
  tryRefreshToken?: (force?: boolean, region?: string) => Promise<unknown>;
  authenticateUser?: (...args: unknown[]) => Promise<unknown>;
  isSessionActive?: () => Promise<boolean>;
};

type DuploRuntimeConfig = {
  enabled?: boolean;
};

declare global {
  interface Window {
    __LVV_DUPLO_CONFIG__?: DuploRuntimeConfig;
    __LVV_DUPLO_AUTH__?: DuploTokenAuthenticator;
  }
}

function isLocalhost(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function isDuploAuthEnabled(): boolean {
  return !isLocalhost() && window.__LVV_DUPLO_CONFIG__?.enabled === true;
}

function getDuploAuthClient(): DuploTokenAuthenticator | null {
  if (!isDuploAuthEnabled()) {
    return null;
  }

  return window.__LVV_DUPLO_AUTH__ || null;
}

export function getAuthenticatedFetch(): typeof fetch | DuploFetchApi {
  const duploAuth = getDuploAuthClient();
  const duploFetch = duploAuth?.getFetchApi?.();
  if (duploFetch) {
    return duploFetch;
  }

  return window.fetch.bind(window);
}

export async function refreshDuploToken(force: boolean, region?: string): Promise<boolean> {
  const duploAuth = getDuploAuthClient();
  if (!duploAuth) {
    return false;
  }

  if (!duploAuth.tryRefreshToken) {
    throw new Error("Duplo auth is enabled but tryRefreshToken is not configured.");
  }

  await duploAuth.tryRefreshToken(force, region);
  return true;
}

export async function authenticateDuploUser(): Promise<boolean> {
  const duploAuth = getDuploAuthClient();
  if (!duploAuth) {
    return false;
  }

  if (!duploAuth.authenticateUser) {
    throw new Error("Duplo auth is enabled but authenticateUser is not configured.");
  }

  await duploAuth.authenticateUser();
  return true;
}
