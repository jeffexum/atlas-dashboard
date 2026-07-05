// server/connhealth.ts — tracks per-integration health so a dead token or failing
// sync surfaces in /api/setup/status instead of silently going stale forever.

type Provider = 'outlook' | 'google' | 'oura' | 'goodreads';

interface Health { needsReauth: boolean; lastOkAt: number; lastError: string | null }

const _h: Record<Provider, Health> = {
  outlook: { needsReauth: false, lastOkAt: 0, lastError: null },
  google: { needsReauth: false, lastOkAt: 0, lastError: null },
  oura: { needsReauth: false, lastOkAt: 0, lastError: null },
  goodreads: { needsReauth: false, lastOkAt: 0, lastError: null },
};

export function markOk(p: Provider): void {
  _h[p] = { needsReauth: false, lastOkAt: Date.now(), lastError: null };
}

export function markReauth(p: Provider, err: string): void {
  _h[p].needsReauth = true;
  _h[p].lastError = err;
}

export function markError(p: Provider, err: string): void {
  _h[p].lastError = err;
}

export function needsReauth(p: Provider): boolean {
  return _h[p].needsReauth;
}

export function connHealth(): Record<Provider, Health> {
  return _h;
}

// Recognize an OAuth "the grant is dead, user must re-consent" error from the
// token-endpoint error code (Microsoft & Google both use invalid_grant).
export function isInvalidGrant(errorCode: string | undefined): boolean {
  return !!errorCode && /invalid_grant|interaction_required|expired_token|AADSTS700082|AADSTS50173/i.test(errorCode);
}
