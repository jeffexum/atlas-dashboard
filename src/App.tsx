import { useState, useEffect } from 'react';
import Shell from './components/Shell';
import { initFromServer, subscribeToServerEvents } from './store/useStore';

export type Screen =
  | 'home'
  | 'inbox'
  | 'calendar'
  | 'todos'
  | 'goals'
  | 'habits'
  | 'health'
  | 'finances'
  | 'reading'
  | 'ideas'
  | 'assistant'
  | 'whiteboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  useEffect(() => {
    initFromServer();
    const unsubscribe = subscribeToServerEvents();
    // Refresh Oura data on every page load (fire-and-forget; SSE delivers the update)
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/oura/sync`).catch(() => {});
    return unsubscribe;
  }, []);

  return <Shell screen={screen} setScreen={setScreen} />;
}
