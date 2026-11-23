import { useSyncExternalStore } from 'react'
import { pwa } from '../pwa'

let version = 0
pwa.subscribe(() => {
  version++
})

/** Re-renders when the service worker or install offer changes. */
export function usePwa() {
  useSyncExternalStore(
    (l) => pwa.subscribe(l),
    () => version,
  )
  return pwa
}
