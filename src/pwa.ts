// Registers the service worker (keeps the app working offline) and
// remembers the "install app" offer on Android so Settings can show a button.

import { registerSW } from 'virtual:pwa-register'

type Listener = () => void
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

export const pwa = {
  needRefresh: false,
  offlineReady: false,
  installPrompt: null as null | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> },
  update: (() => {}) as () => void,
  subscribe(l: Listener) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function startPwa() {
  if (!('serviceWorker' in navigator)) return
  const updateSW = registerSW({
    onNeedRefresh() {
      pwa.needRefresh = true
      emit()
    },
    onOfflineReady() {
      pwa.offlineReady = true
      emit()
    },
    onRegisteredSW(_url, reg) {
      // Look for a new version of the app every hour while it is open.
      if (reg) setInterval(() => navigator.onLine && reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
  // Switch to the new version, then reload the page once it has taken over.
  pwa.update = () => {
    let reloaded = false
    const reload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
    updateSW(true)
    setTimeout(reload, 4000) // fallback if the browser never announces the switch
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pwa.installPrompt = e as unknown as typeof pwa.installPrompt
    emit()
  })
  window.addEventListener('appinstalled', () => {
    pwa.installPrompt = null
    emit()
  })
}

export function isInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
