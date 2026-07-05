// src/auth.ts — attaches the instance secret to every API call.
// Import this FIRST (before anything that fetches). No-op when no secret is set.

const API_URL = import.meta.env.VITE_API_URL || '';
const SECRET = import.meta.env.VITE_ATLAS_SECRET || '';

if (SECRET && API_URL) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(API_URL)) {
      init.headers = { ...(init.headers || {}), Authorization: `Bearer ${SECRET}` };
    }
    return originalFetch(input as RequestInfo, init);
  };
}

// EventSource can't send headers — append the secret as a query param instead
export function sseUrl(url: string): string {
  if (!SECRET) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(SECRET)}`;
}
