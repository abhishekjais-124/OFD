# OFD · Of the Day

A personal reader for the daily **Morning Briefing** PDF. Every morning a routine drops
`Morning-Briefing-YYYY-MM-DD.pdf` into a Google Drive folder; OFD finds today's file (today in
IST), pulls out its sections, links, tables and images, and shows them as cards you can act on
from a phone: action items with countdowns, headline cards, the question of the day, the job of
the day, and everything else the PDF contains. The original PDF is one tap away for verification.

## Stack, in two lines

Node + Express API (`server/`) with [mupdf](https://mupdf.readthedocs.io/en/latest/mupdf-js.html)
(WASM, no native build) for text, link annotations, images and page rendering, and tesseract.js
for local OCR; a Vite + React PWA (`web/`). One repo, one `npm run dev`, no paid APIs.

## Quick start

```bash
npm install
cp .env.example .env     # the example already points at the Routines folder
npm run dev              # API on http://localhost:8787, UI on http://localhost:5180
```

Open http://localhost:5180. With the folder shared "with anyone with the link" (which it is
today) this works with **no credentials**: OFD lists the folder through Drive's public folder
view and downloads through the public download endpoint ("public" mode). Without Drive at all,
drag a PDF onto the page: it goes through the same pipeline.

Production build: `npm run build` then `npm start` (serves the built UI and the API from one port).

## Drive access

The folder belongs to **abhishekjais124124@gmail.com**. A work Google account cannot open it,
so any credential OFD uses must come from that personal account (or the folder must stay shared
by link). OFD only ever asks for the Drive **read-only** scope. Secrets live in `.env`
(git-ignored); `.env.example` lists every variable.

`DRIVE_AUTH=auto` picks the first configured option in this order:

| Mode | Set | Notes |
| --- | --- | --- |
| `service_account` | `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_FILE` | Create a service account in Google Cloud, download its JSON key, share the folder with the service account's e-mail as **Viewer**. Works for private folders; the recommended option. |
| `oauth` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | Create a "Desktop app" OAuth client, then run `npm run drive:auth` and sign in with the personal account; paste the printed refresh token into `.env`. |
| `api_key` | `GOOGLE_API_KEY` | Free API key with the Drive API enabled. Enough while the folder is shared by link, and it reports real `modifiedTime`s. |
| `public` | nothing | Zero config while the folder is shared by link. `modifiedTime` is only known after a download (from the `Last-Modified` header), so re-uploads are detected on **Refresh**, not on every load. |

Why not only the "preferred" options: the folder is link-shared, so the simplest *secure*
choice is to need no secret at all, and to add a service account the day the folder goes private.
All four modes share the same `DriveClient` interface (`server/drive/types.ts`).

## How it works

```
drive (find + fetch)  →  extract (text, links, images, OCR)  →  normalize + validate (schema)  →  store (cache)  →  API  →  UI
```

* **Date**: `shared/ist.ts` is the only place that decides what "today" is (Asia/Kolkata, no
  DST). Deadlines and countdowns use it too, and the UI shows the document date, the Drive
  version and the "processed at" time.
* **File selection** (`server/drive/select.ts`): exact `Morning-Briefing-YYYY-MM-DD.pdf` names,
  newest `modifiedTime` wins when a date has several files (the UI says so), near-miss names
  are listed as ignored. A missing day is reported as missing; another day's file is never
  shown as today's. The last available day is offered as a clearly labelled secondary option.
* **Extraction** (`server/extract/`): per page, text lines with font weight and size, link
  annotations with their rectangles, embedded images (PNG), page size. Pages without a text
  layer are rendered and sent to tesseract.js (English model downloaded once into `.cache/`),
  and everything from them is flagged "OCR, lower confidence".
* **Normalization** (`server/normalize/`): headings are detected by typography (bold, larger,
  alone on their line), tables by a bold header row and column alignment (rows split on the
  vertical gap, tables continue across page breaks), cards by vertical proximity. Links are
  attached by geometry, labelled by the text printed before them, and URLs printed without an
  annotation are recovered from text with lower confidence. Known sections (glance, mail,
  calendar, headlines, question, job, routine) get typed parsers; unknown headings become a
  generic section and are listed in the extraction notes. The result is validated with zod
  (`shared/schema.ts`) before it is stored.
* **Cache** (`server/store/`): keyed by document; a result is reused only for the same Drive
  `modifiedTime` and parser version. **Refresh** asks Drive again and re-downloads when the
  version changed (or is unknown); **Reprocess** re-parses the cached PDF without the network.
  Bump `PARSER_VERSION` in `server/normalize/index.ts` after parser changes and every cached
  file is reprocessed on its next view.
* **PWA**: `web/public/sw.js` keeps the app shell, the last API answers, images and PDFs, and
  the UI shows "Offline, showing data from <time>" when a response came from that cache.

### Weather

The Today hero shows the weather at the device's location and restyles itself to match: sky colours,
sun or moon, stars, clouds, rain, snow, fog or lightning, and a matching tint behind the whole app.
The browser asks for location permission once; the last position and reading are kept on the device.
The UI sends only coordinates rounded to two decimals (about 1 km) to this server, which asks
[Open-Meteo](https://open-meteo.com/) for the conditions and BigDataCloud's keyless reverse geocoder
for the place name, and caches the answer for ten minutes. No keys, no accounts. If location is
blocked, the hero stays on the default style and offers a "Use my location" button.

### API

| Route | Purpose |
| --- | --- |
| `GET /api/today` | Today's briefing (IST). `?refresh=1` re-fetches. |
| `GET /api/briefings` | Dates present in the folder and cached documents. |
| `GET /api/briefings/:date` | A specific date, same rules as today. |
| `POST /api/briefings/:date/refresh` | Re-fetch from Drive. |
| `POST /api/documents/:key/reprocess` | Re-parse the cached PDF. |
| `POST /api/upload` | Raw PDF bytes in the body (`x-file-name` header optional). |
| `GET /api/documents/:key/pdf` | The original PDF (`#page=N` jumps to a page). |
| `GET /api/images/:id.png` | An extracted image. |
| `GET /api/weather?lat=&lon=` | Current weather for a coordinate (rounded to 2 decimals), cached 10 minutes. |
| `GET /api/status` | Drive mode, folder, parser version, today in IST. |

## Testing

```bash
npm test          # vitest
npm run typecheck
```

The fixtures in `fixtures/synthetic/` are generated from `briefing.template.html` (same structure
as the real PDF, invented content, example.com links) with `npm run fixtures` (needs Google
Chrome), plus scanned, password-protected, truncated and non-PDF variants. The real PDFs contain
work mail and are not committed. Tests cover IST date selection around midnight, file selection
(missing, duplicate, wrong-date and near-miss names), extraction of text, links and images,
corrupted, password-protected and scanned input with and without OCR, normalization of every
section, cache hits, refresh, reprocess, parser-version invalidation, the HTTP API and the
service worker's offline strategies. `npm run check:offline` (after `npm run build` and
`OFD_API_PORT=8791 npm start`) drives headless Chrome through a real service worker, goes offline
and checks that the briefing and the offline banner still render.

## Troubleshooting

* **"No access to the Drive folder"**: the identity in `.env` cannot see the folder. In public
  mode the folder is no longer shared by link; switch to a service account (share the folder with
  its e-mail) or the OAuth token of the owning account.
* **"No briefing for <date> yet"**: the routine has not written today's file. "Check again"
  re-lists the folder; the last available day is offered separately.
* **Several files for one date**: the newest `modifiedTime` is shown and a notice says so.
* **Headlines without images / weird tables**: open "Extraction notes" at the bottom; every
  item also links to its page in the original PDF ("p. 3").
* **OCR is slow the first time**: the English model (~4 MB) is downloaded into `.cache/tessdata`.
  Set `OFD_OCR=0` to disable the fallback.
* **Something stale after a parser change**: Reprocess, or bump `PARSER_VERSION`.
* **Port in use**: the UI port is `PORT` (default 5180) and the API port is `OFD_API_PORT`
  (default 8787); the UI proxies `/api` to the API in development.
* **Reset everything**: delete `.cache/`.
