import { useState } from 'react';
import { login } from '../auth';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      const ok = await login(password);
      if (ok) onSuccess();
      else setError('Incorrect password.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <form onSubmit={submit} style={{ width: 320, padding: 28, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontFamily: "'Newsreader', serif", fontSize: 22, color: 'var(--ink)', marginBottom: 4 }}>Atlas</div>
        <div style={{ fontSize: 12.5, color: 'var(--mut)', marginBottom: 18 }}>Enter your password to continue.</div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ width: '100%', padding: '9px 11px', fontSize: 13.5, border: '1px solid var(--line)', borderRadius: 6, outline: 'none', background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box', marginBottom: 10 }}
        />
        {error && <div style={{ fontSize: 12, color: 'var(--p1)', marginBottom: 10 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy || !password}
          style={{ width: '100%', padding: '9px', fontSize: 13.5, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: busy || !password ? 'default' : 'pointer', opacity: busy || !password ? 0.6 : 1, fontFamily: 'inherit' }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
