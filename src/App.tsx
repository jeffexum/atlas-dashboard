import { useState, useEffect } from 'react';
import Shell from './components/Shell';
import Login from './components/Login';
import Toast from './components/Toast';
import { initFromServer, subscribeToServerEvents, useStore } from './store/useStore';
import { checkSession, API_URL } from './auth';

export type Screen =
  | 'home'
  | 'inbox'
  | 'calendar'
  | 'todos'
  | 'shopping'
  | 'delegations'
  | 'goals'
  | 'habits'
  | 'health'
  | 'finances'
  | 'reading'
  | 'ideas'
  | 'assistant'
  | 'whiteboard'
  | 'setup'
  | 'eval';

type Auth = 'checking' | 'in' | 'out';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [auth, setAuth] = useState<Auth>('checking');

  useEffect(() => {
    checkSession().then((s) => {
      // If auth isn't required (local dev) or already authed, go straight in.
      setAuth(!s.authRequired || s.authed ? 'in' : 'out');
    });
  }, []);

  useEffect(() => {
    if (auth !== 'in') return;
    initFromServer();
    const unsubscribe = subscribeToServerEvents((connected) => useStore.setState({ sseConnected: connected }));
    // Refresh Oura data on load (fire-and-forget; SSE delivers the update)
    fetch(`${API_URL}/api/oura/sync`).catch(() => {});
    return unsubscribe;
  }, [auth]);

  if (auth === 'checking') {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)', background: 'var(--bg)', fontSize: 13 }}>Loading…</div>;
  }
  if (auth === 'out') {
    return <Login onSuccess={() => setAuth('in')} />;
  }

  return (
    <>
      <Shell screen={screen} setScreen={setScreen} />
      <Toast />
    </>
  );
}
