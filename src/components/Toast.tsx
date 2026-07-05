import { useEffect } from 'react';
import { useStore } from '../store/useStore';

// Global feedback surface: shows API/save failures (and occasional confirmations)
// instead of swallowing them silently. Also shows a persistent banner when the live
// SSE connection drops so the user knows the dashboard has gone stale.
export default function Toast() {
  const toast = useStore((s) => s.toast);
  const sseConnected = useStore((s) => s.sseConnected);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useStore.setState({ toast: null }), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {!sseConnected && (
        <div style={{ padding: '7px 14px', fontSize: 12.5, borderRadius: 8, background: 'var(--p2bg, #fff3cd)', color: 'var(--ink)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)' }}>
          Reconnecting to live updates…
        </div>
      )}
      {toast && (
        <div
          onClick={() => useStore.setState({ toast: null })}
          style={{ padding: '9px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer', color: '#fff', background: toast.kind === 'error' ? 'var(--p1)' : 'var(--accent)', boxShadow: 'var(--shadow-card)' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
