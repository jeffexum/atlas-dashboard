// src/auth.ts — cookie-based session auth. No secret is baked into the bundle.
// The browser authenticates via an httpOnly session cookie set by POST /api/login;
// we just make sure every API call and the SSE stream send credentials.

export const API_URL = import.meta.env.VITE_API_URL || '';

const originalFetch = window.fetch.bind(window);

// Attach credentials to same-API requests so the session cookie rides along
// (needed for cross-site cookies between the static site and the API subdomain).
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isApiCall = API_URL ? url.startsWith(API_URL + '/') || url === API_URL : url.startsWith('/api');
  if (isApiCall && init.credentials === undefined) {
    init = { ...init, credentials: 'include' };
  }
  return originalFetch(input as RequestInfo, init);
};

// EventSource sends cookies when withCredentials is set (see useStore SSE setup).
export function sseUrl(url: string): string {
  return url;
}

export async function checkSession(): Promise<{ authed: boolean; loginConfigured: boolean; authRequired: boolean }> {
  try {
    const res = await originalFetch(`${API_URL}/api/session`, { credentials: 'include' });
    if (!res.ok) return { authed: false, loginConfigured: true, authRequired: true };
    return await res.json();
  } catch {
    return { authed: false, loginConfigured: true, authRequired: true };
  }
}

export async function login(password: string): Promise<boolean> {
  const res = await originalFetch(`${API_URL}/api/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}
