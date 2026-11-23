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

`npm test` checks how pasted hymns are split into verses and choruses.

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
public/          icons and the bundled fonts (fonts/ — see fonts note below)
src/
  styles/        colours, sizes, fonts, light/dark themes (tokens.css)
  lib/           connection to Supabase; later: search, offline storage
  App.tsx        Phase 0 check page (replaced by the Library in Phase 2)
  admin/         the admin site (/admin): login, hymn list, editor, history
  components/    shared pieces: Ewe character buttons, hymn text display
supabase/
  migrations/    the database tables and security rules, numbered in order (Phase 1)
templates/       downloadable CSV/JSON templates for bulk upload (Phase 5)
docs/            plain-language guides for admins
scripts/         maintenance notes (e.g. how the fonts were built)
```

### Fonts

The app bundles its own copies of **Noto Serif** and **Noto Sans** (SIL Open Font
License, see `public/fonts/OFL.txt`), cut down to Latin letters, all Ewe letters
(ɖ ɛ ɔ ŋ ƒ ʋ ɣ and capitals) and every tone mark, including the rising (ˇ) and
falling (ˆ) marks that the standard web font packages leave out. Nothing is
loaded from Google or any other outside server.

---

## Build phases

- [x] **Phase 0**: project setup, accounts, Ewe character check
- [x] **Phase 1**: database, security rules, admin login and hymn editor
- [ ] **Phase 2**: reader app (library, lists, hymn view, search, categories)
- [ ] **Phase 3**: offline use and automatic updates
- [ ] **Phase 3b**: melody playback
- [ ] **Phase 4**: service queue, sermon notes, Hymn of the Day
- [ ] **Phase 5**: bulk upload/export, change history, content checks, privacy page
- [ ] **Phase 6** (optional): App Store and Google Play
- [ ] **Phase 7** (optional): sing to find a hymn

## Content rules

All hymn text is supplied by the owner. Every hymn records its **source** and
**rights status** (`public_domain`, `permission_granted`, `original_work`,
`unknown`). Text from other apps or hymnbooks is not included without confirmed
public-domain status or written permission.
