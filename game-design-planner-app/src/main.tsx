import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk'
import './core/i18n'
import './styles.css'
import { initTheme } from './core/theme'
import { App } from './App'

// Before the first render, so the page never flashes the other theme (the CSP forbids an inline script in index.html).
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
