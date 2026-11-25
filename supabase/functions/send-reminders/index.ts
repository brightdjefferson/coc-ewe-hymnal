// =====================================================================
// COC Ewe Hymnal: "send-reminders"
//
// Woken every 15 minutes by the database timer. It finds phones whose
// reminder time has passed today (in their own time zone), works out the
// Hymn of the Day exactly as the app does, and sends each phone a
// notification. Uses only built-in browser-standard tools; no libraries.
//
// Set up in Supabase: Edge Functions -> Deploy a new function -> Via
// Editor -> name it  send-reminders  -> replace the code with this whole
// file -> Deploy. Then in the function's Settings turn OFF "Verify JWT"
// (this file checks its own password instead).
// =====================================================================

const SITE = 'https://coc-ewe-hymnal.vercel.app'

// Supabase runs this with Deno; tests run it with Node (no Deno there).
const Deno = (globalThis as unknown as {
  Deno?: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void }
}).Deno
const env = (k: string) => Deno?.env.get(k) ?? ''

// ---------- small helpers ----------
const enc = new TextEncoder()

export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// ---------- Hymn of the Day (must match src/lib/hymnOfDay.ts) ----------
export function dayHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
export interface DayHymn {
  id: string
  number: number
  title_ee: string | null
  title_en: string | null
  slug: string
}
/** `hymns` must already be only published hymns that have words. */
export function pickHymn<T extends { id: string }>(hymns: T[], day: string): T | null {
  if (!hymns.length) return null
  const sorted = [...hymns].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[dayHash(day) % sorted.length]
}
export function message(h: DayHymn, lang: string) {
  const title = (lang === 'en' ? h.title_en || h.title_ee : h.title_ee || h.title_en) ?? ''
  return { title: 'Hymn of the Day', body: `${h.number} · ${title}`, url: `/c/${h.slug}/${h.number}` }
}

// ---------- Web Push: keys, signature (RFC 8292), encryption (RFC 8291) ----------
export async function makeKeys(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { publicKey: b64u(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }
}

export async function vapidHeader(endpoint: string, publicKey: string, privateJwk: JsonWebKey, contact = SITE): Promise<string> {
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })),
  )
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${publicKey}`
}

export async function encrypt(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = unb64u(p256dh)
  const authSecret = unb64u(auth)
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const prkKey = await hmac(authSecret, shared)
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const plain = concat(enc.encode(payload), new Uint8Array([2]))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain))
  const head = new Uint8Array(21)
  head.set(salt, 0)
  new DataView(head.buffer).setUint32(16, 4096)
  head[20] = asPublic.length
  return concat(head, asPublic, cipher)
}

export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  keys: { publicKey: string; privateJwk: JsonWebKey },
): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidHeader(sub.endpoint, keys.publicKey, keys.privateJwk),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(12 * 3600),
        Urgency: 'normal',
        Topic: 'hymn-of-the-day',
      },
      body: await encrypt(payload, sub.p256dh, sub.auth),
      signal: AbortSignal.timeout(10000),
    })
    await res.body?.cancel()
    if (res.status === 404 || res.status === 410) return 'gone'
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

// ---------- talking to the database (with the built-in service key) ----------
function db() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY')
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  async function call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } })
    if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${await res.text()}`)
    const t = await res.text()
    return t ? JSON.parse(t) : null
  }
  return {
    get: (path: string) => call(path),
    rpc: (name: string, args: unknown = {}) => call(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }),
    patch: (path: string, body: unknown) => call(path, { method: 'PATCH', body: JSON.stringify(body), headers: { Prefer: 'return=minimal' } }),
  }
}

async function publishedHymns(d: ReturnType<typeof db>): Promise<DayHymn[]> {
  const out: DayHymn[] = []
  for (let from = 0; ; from += 1000) {
    const rows = await d.get(
      `hymns?select=id,number,title_ee,title_en,collections(slug),verses(count)&status=eq.published&order=id&offset=${from}&limit=1000`,
    )
    for (const r of rows) {
      if ((r.verses?.[0]?.count ?? 0) > 0) out.push({ id: r.id, number: r.number, title_ee: r.title_ee, title_en: r.title_en, slug: r.collections.slug })
    }
    if (rows.length < 1000) return out
  }
}

async function run(req: Request): Promise<Response> {
  const d = db()
  let [row] = await d.get('push_keys?id=eq.1&select=public_key,private_jwk,cron_token')
  if (!row || req.headers.get('x-reminder-token') !== row.cron_token) return new Response('Not allowed', { status: 401 })

  if (!row.public_key || !row.private_jwk) {
    const k = await makeKeys()
    await d.patch('push_keys?id=eq.1&public_key=is.null', { public_key: k.publicKey, private_jwk: k.privateJwk })
    ;[row] = await d.get('push_keys?id=eq.1&select=public_key,private_jwk,cron_token')
  }
  const keys = { publicKey: row.public_key as string, privateJwk: row.private_jwk as JsonWebKey }

  const due: { id: string; endpoint: string; p256dh: string; auth: string; lang: string; local_date: string }[] =
    await d.rpc('due_reminders')
  if (!due.length) return Response.json({ due: 0 })

  const hymns = await publishedHymns(d)
  const byDay = new Map<string, DayHymn | null>()
  const results: { id: string; date: string; result: string }[] = []
  let i = 0
  async function worker() {
    while (i < due.length) {
      const s = due[i++]
      if (!byDay.has(s.local_date)) byDay.set(s.local_date, pickHymn(hymns, s.local_date))
      const h = byDay.get(s.local_date)
      if (!h) {
        results.push({ id: s.id, date: s.local_date, result: 'sent' }) // no hymns yet: nothing to send today
        continue
      }
      results.push({ id: s.id, date: s.local_date, result: await sendPush(s, JSON.stringify(message(h, s.lang)), keys) })
    }
  }
  await Promise.all(Array.from({ length: 10 }, worker))
  await d.rpc('record_reminders', { p: results })
  const count = (r: string) => results.filter((x) => x.result === r).length
  return Response.json({ due: due.length, sent: count('sent'), gone: count('gone'), failed: count('failed') })
}

if (Deno) {
  Deno.serve(async (req) => {
    try {
      return await run(req)
    } catch (e) {
      console.error(e)
      return new Response('Something went wrong; see the function logs.', { status: 500 })
    }
  })
}
