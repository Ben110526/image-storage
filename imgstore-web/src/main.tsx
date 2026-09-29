import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/* iOS-style pointer-tracking specular: update --mx/--my on the nearest glass
 * pane so its ::after light blob follows the cursor (see index.css). */
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('.glass-surface, .spatial-card, .navbar-glass')
      if (!(el instanceof HTMLElement)) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
    },
    { passive: true },
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
