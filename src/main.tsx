import './auth' // must load first — wraps fetch with the instance secret

// Apply saved theme before first paint to avoid a light flash
document.documentElement.dataset.theme = localStorage.getItem('atlas-theme') || 'light'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
