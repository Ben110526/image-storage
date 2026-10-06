import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/* Navbar scroll edge — the one dynamic behaviour CSS cannot derive.
 *
 * Writes ONE custom property (--edge, 0→1) on the navbar as content scrolls
 * under it; index.css uses it to mix in a canvas-coloured veil and a hairline.
 * Quantised so we repaint ~20 times across the ramp instead of per pixel.
 *
 * Honours the effective reduced-transparency flag (app toggle OR OS): when
 * materials are solid the veil does nothing visible, so the listener is not
 * even attached. Reacts live when the flag flips mid-session. */

/** Scroll distance over which the navbar's edge effect ramps 0 → 1. */
const EDGE_RAMP_PX = 48

/** ~20 steps across the ramp is visually identical to continuous. */
const EDGE_STEP = 0.05

if (typeof window !== 'undefined') {
  let lastEdge = -1
  let scrollFrame = 0

  const clearEdge = () => {
    lastEdge = -1
    document
      .querySelector<HTMLElement>('.navbar-glass')
      ?.style.removeProperty('--edge')
  }

  const applyScroll = () => {
    scrollFrame = 0

    // The navbar mounts with the app, so it is looked up per update rather than
    // cached — caching would miss it if it ever remounts.
    const nav = document.querySelector<HTMLElement>('.navbar-glass')
    if (!nav) return

    const raw = Math.min(1, Math.max(0, window.scrollY / EDGE_RAMP_PX))
    const edge = Math.round(raw / EDGE_STEP) * EDGE_STEP
    if (edge === lastEdge) return
    lastEdge = edge

    nav.style.setProperty('--edge', edge.toFixed(2))
  }

  const onScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(applyScroll)
  }

  let listening = false
  const attach = () => {
    if (listening) return
    listening = true
    window.addEventListener('scroll', onScroll, { passive: true })
    // Initial state: a reload mid-page must not paint the navbar clear with
    // content already underneath it.
    applyScroll()
  }
  const detach = () => {
    if (!listening) return
    listening = false
    window.removeEventListener('scroll', onScroll)
    if (scrollFrame) cancelAnimationFrame(scrollFrame)
    scrollFrame = 0
    clearEdge()
  }

  // Effective transparency = app toggle OR OS signal; both are stamped on
  // <html data-transparency> by the bootstrap / AppearanceProvider. A
  // MutationObserver on that one attribute keeps this listener in sync with
  // both sources without polling.
  const syncEdgeListener = () => {
    if (document.documentElement.getAttribute('data-transparency') === 'reduced') detach()
    else attach()
  }
  syncEdgeListener()
  new MutationObserver(syncEdgeListener).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-transparency'],
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
