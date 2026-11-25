import { supabase } from '../lib/supabase'
import { isInstalled, isIOS } from '../pwa'
import { read, write } from './prefs'
import type { Lang } from '../lib/types'

export interface Reminder {
  on: boolean
  time: string // HH:MM, the phone's own time
}
export const REMINDER_KEY = 'reminder'
export const DEFAULT_REMINDER: Reminder = { on: false, time: '06:00' }

export type ReminderSupport = 'ok' | 'ios-install' | 'unsupported' | 'blocked'

export function reminderSupport(): ReminderSupport {
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIOS() && !isInstalled()) return 'ios-install'
  if (!hasPush) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'ok'
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const t = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
const same = (a: ArrayBuffer | null, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i])

export class ReminderError extends Error {}

/** Turns the reminder on (or saves a new time / language). */
export async function saveReminder(time: string, lang: Lang): Promise<void> {
  if (!supabase) throw new ReminderError('The hymnal is not connected yet.')
  if (!navigator.onLine) throw new ReminderError('You need internet to turn reminders on. Please try again when you are online.')
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (perm !== 'granted') throw new ReminderError('Notifications were not allowed, so the reminder could not be turned on.')

  const { data: pk, error: e1 } = await supabase.rpc('reminder_public_key')
  if (e1) throw new ReminderError('Could not reach the hymnal right now. Please try again later.')
  if (!pk) throw new ReminderError('Reminders are not ready on the church’s side yet. Please try again later.')
  const key = keyBytes(pk as string)

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (sub && !same(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_reminder', {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh ?? '',
    p_auth: j.keys?.auth ?? '',
    p_time: time,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    p_lang: lang,
  })
  if (error) throw new ReminderError('Could not save the reminder. Please try again later.')
  write(REMINDER_KEY + ':synced', Date.now())
}

/** Turns the reminder off on this phone. */
export async function removeReminder(): Promise<void> {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const sub = await reg?.pushManager?.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await supabase?.rpc('delete_reminder', { p_endpoint: endpoint })
}

/**
 * Once a week, quietly re-saves an active reminder, in case the phone's
 * browser changed its notification address or the time zone changed.
 */
export async function refreshReminder(lang: Lang): Promise<void> {
  const r = read<Reminder>(REMINDER_KEY, DEFAULT_REMINDER)
  if (!r.on || reminderSupport() !== 'ok' || Notification.permission !== 'granted' || !navigator.onLine) return
  const last = read<number>(REMINDER_KEY + ':synced', 0)
  if (Date.now() - last < 7 * 24 * 3600 * 1000) return
  await saveReminder(r.time, lang).catch(() => {})
}
