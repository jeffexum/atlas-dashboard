import { useState } from 'react';
import Shell from './components/Shell';

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
  | 'assistant';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  return <Shell screen={screen} setScreen={setScreen} />;
}
