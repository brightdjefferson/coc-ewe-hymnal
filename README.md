# COC Ewe Hymnal

A free, offline hymnal in **Ewe and English** for Churches of Christ.
No ads, no reader accounts, no tracking.

It has two parts:

- **Reader app**: church members browse, search and read hymns, even with no internet.
- **Admin site** (at `/admin`, from Phase 1): approved admins log in to add, edit and publish hymns.

---

## How the pieces fit together

| Piece | What it does | Cost |
|---|---|---|
| **GitHub** | Stores the app's code and every saved change, so we can always go back | Free |
| **Supabase** | The database that holds the hymns, plus the admin logins | Free plan |
| **Vercel** | Puts the app on the internet. Each change saved to GitHub goes live automatically | Free plan |

You don't need to install anything to use or test the app. Open its web link.

---

## Where the secret settings live

The app needs two values from Supabase:

- `VITE_SUPABASE_URL`: your project's web address
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable (or "anon") key

Put them in **Vercel → your project → Settings → Environment Variables**.
They are **never** written into the code, and never pasted into a chat.

These two values are made to be used in a web page; the database's security
rules protect the data. Supabase also gives you a **secret / service_role key**:
that one must never go into the app, Vercel or anywhere else.

---

## Tests

`npm test` checks how pasted hymns are split into verses and choruses, and how search
finds and ranks hymns (plain letters finding Ewe letters, typos, number ranking).

## Running it on a computer (optional, for developers)

You only need this if you want to run the app on your own computer.

1. Install **Node.js** (the "LTS" version) from nodejs.org.
2. Open a terminal in this folder and run `npm install`.
3. Copy `.env.example` to a new file called `.env.local` and fill in the two values.
4. Run `npm run dev` and open the address it prints (usually http://localhost:5173).

Other commands:

- `npm run build`: builds the finished app into the `dist` folder
- `npm run preview`: shows that finished build locally

---

## Folder guide

```
public/          icons (icons/), the bundled fonts (fonts/ — see fonts note below)
src/
  styles/        colours, sizes, fonts, light/dark themes (tokens.css)
  lib/           connection to Supabase; later: search, offline storage
  App.tsx        character and database check page (at /check)
  reader/        the reader app: home, lists, hymn page, search, categories, favourites, settings
  admin/         the admin site (/admin): login, hymn list, editor, history, collections & categories
  components/    shared pieces: Ewe character buttons, hymn text display
supabase/
  migrations/    the database tables and security rules, numbered in order (Phase 1)
public/templates/ the Word typing template offered on the upload page
docs/            plain-language guides for admins
scripts/         maintenance notes (e.g. how the fonts were built)
```

### Fonts

The app bundles its own copies of **Noto Serif** (regular, italic, bold) and **Noto Sans** (regular, bold, extra-bold) (SIL Open Font
License, see `public/fonts/OFL.txt`), cut down to Latin letters, all Ewe letters
(ɖ ɛ ɔ ŋ ƒ ʋ ɣ and capitals) and every tone mark, including the rising (ˇ) and
falling (ˆ) marks that the standard web font packages leave out. Nothing is
loaded from Google or any other outside server.

---

## Logo

Sunrise over an open hymnal, with the Ewe letter ɛ drawn as a music note and an orange
ribbon bookmark. Source: `public/favicon.svg` (and `src/components/Logo.tsx`); app icons in
`public/icons/` are made from it.

## Build phases

- [x] **Phase 0**: project setup, accounts, Ewe character check
- [x] **Phase 1**: database, security rules, admin login and hymn editor
- [x] **Phase 2**: reader app (library, lists, hymn view, search, categories)
- [x] **Bulk upload** (brought forward from Phase 5): Word, PDF, CSV and JSON, with preview
- [x] **Phase 3**: offline use and automatic updates
- [x] **Design pass**: “Calm” look (night blue, sunset orange, mist), new logo, light/dark
- [ ] **Phase 3b**: melody playback
- [ ] **Phase 4**: service queue, sermon notes, Hymn of the Day
- [ ] **Phase 5**: bulk upload/export, change history, content checks, privacy page
- [ ] **Phase 6** (optional): App Store and Google Play
- [ ] **Phase 7** (optional): sing to find a hymn

## How offline works

- The first visit downloads every published hymn into the phone's storage (IndexedDB).
- Later visits open instantly from that copy, then check `content_version` in the
  database; if it changed, the whole library is downloaded again and "Hymns updated" is shown.
- A service worker (vite-plugin-pwa / Workbox) keeps the app's own files on the phone.
  When a new version of the app is published, readers see "A new version of the app is ready".
- The admin site still needs internet. The Word/PDF readers are not stored offline.

## Content rules

All hymn text is supplied by the owner. Every hymn records its **source** and
**rights status** (`public_domain`, `permission_granted`, `original_work`,
`unknown`). Text from other apps or hymnbooks is not included without confirmed
public-domain status or written permission.
