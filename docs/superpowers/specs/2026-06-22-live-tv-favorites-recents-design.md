# Live TV — Folder Favorites & Recently Watched

**Date:** 2026-06-22
**Status:** Approved (design)

## Problem

The Live TV tab shows a flat list of collapsible category folders (e.g. `|NA| USA MLB`).
Two gaps in the current UX:

1. **No folder favoriting.** Only individual *channels* can be favorited today
   (per-user, stored in SQLite; surfaced as a synthetic "Favorites" group pinned at
   the top of the list). There is no way to favorite a whole folder/category.
2. **No "recently watched" for live.** Live channels are never written to watch
   history — `WatchPage.saveProgress()` only saves `movie`/`episode` and bails when
   `duration <= 0`, which is always true for live streams. So there is no list of
   recently watched live channels.

## Goal

In the Live TV tab, let the user:

- Favorite **folders** (categories) as well as channels.
- See **Favorites** (folders + channels) pinned at the top of the list.
- See **Recently Watched** live channels pinned at the top of the list.

## Decisions (from brainstorming)

- **Layout:** Two pinned, collapsible sections at the top of the existing channel
  list — `⭐ Favorites` and `🕘 Recently Watched` — above the normal folders.
  (Matches the existing pinned-Favorites pattern.)
- **Favorite scope:** Folders **and** channels. Existing per-channel favorites are
  kept. Both appear under the `⭐ Favorites` section.
- **Recents scope:** Live channels only (newly tracked). Movie/series recents stay
  on the Home page as they are today.
- **Folder-favorite storage:** Per-user in SQLite, reusing the existing `favorites`
  table with a new `itemType: 'category'` — not localStorage — so it behaves like
  channel favorites and syncs across devices.
- **Favorite affordance:** A ⭐ star button on each folder header, next to the
  channel count, mirroring the per-channel star.
- **Duplication:** A favorited folder/channel appears in the `⭐ Favorites` section
  *and* still appears in its normal position below. Consistent with how channel
  favorites already behave.
- **Recents:** Last **10** live channels, de-duped by channel, most-recent first.
- **Tracking trigger:** A channel is recorded as "watched" on **play-start** (not
  after N seconds).

## Data model

### Folder favorites — reuse `favorites` table

The existing `favorites` table (`server/db/sqlite.js`) stores per-user favorites with
`(user_id, source_id, item_id, item_type)`. We add a new `item_type` value:
`'category'`.

- `item_id` = the category key the list already groups/collapses by — i.e. the
  category **name** (`groupTitle`, the same string used for `collapsedGroups`).
- `source_id` = the channel's source id.

No schema migration needed (the column is free-text). Only validation enums change.

### Live recents — reuse `watch_history` table

When a live channel starts playing, POST a history row:

```
POST /api/history
{
  id: <channelId>,
  type: 'channel',
  sourceId: <sourceId>,
  data: { title, icon, streamUrl, groupTitle }
}
```

- `progress`/`duration` omitted (server already defaults them to 0; the POST route
  does **not** require a positive duration — that guard lives only in the frontend
  `saveProgress`, which we leave untouched).
- `updated_at` is set server-side to `Date.now()`, giving recency ordering for free.

## Backend changes

1. `server/routes/favorites.js` — add `'category'` to the `itemType` enum in the
   POST and DELETE `validateBody` schemas (the enum is defined inline in those route
   handlers; no `middleware/validate` change is needed).

No new routes:
- `GET /api/favorites?itemType=category` already returns category favorites.
- `GET /api/history?limit=N` already returns history; the frontend filters
  `item_type === 'channel'`.

## Frontend changes

All in `public/js/components/ChannelList.js`, plus a small hook in
`public/js/pages/WatchPage.js`.

### ChannelList.js

- **Load folder favorites:** alongside the existing channel-favorites load, fetch
  `itemType=category` favorites into a `Set<"sourceId:categoryName">`.
- **Folder favorite API:** `isFolderFavorite(sourceId, categoryName)` and
  `toggleFolderFavorite(sourceId, categoryName)` (POST/DELETE `/api/favorites` with
  `itemType:'category'`, optimistic UI update).
- **Star on folder header:** render a ⭐ button in each `.group-header`, next to the
  count. Click toggles favorite and stops propagation so it doesn't expand/collapse
  the folder.
- **Pinned sections** rendered above all real folders:
  - **⭐ Favorites** — favorited folders rendered as expandable sub-folders
    (reusing the normal folder render, showing that category's channels when
    expanded) + favorited channels as flat rows. Hidden when empty.
  - **🕘 Recently Watched** — fetch history, filter `type==='channel'`, de-dupe by
    `sourceId:channelId` keeping newest, take 10. Render each with a relative
    timestamp ("2m ago"); click plays from stored `streamUrl`/`data`. Hidden when
    empty.
- **Collapse state:** both sections collapsible; persist in `localStorage` like the
  existing groups (extend the existing collapsed-groups mechanism with reserved keys
  for the two synthetic sections). Default expanded.
- **Source filter:** Favorites and Recents respect the active "All Sources" /
  single-source filter, same as the rest of the list.

### WatchPage.js

- On live-channel playback start, fire the `type:'channel'` history POST described
  above. One-shot (not on the 10s interval). `saveProgress` is unchanged.

## Edge cases

- **Play from recents:** entries carry `streamUrl` + `data`, so a recent channel
  plays even if it's filtered out of / absent from the current view.
- **De-dupe:** recents de-duped by `sourceId:channelId`, newest kept.
- **Empty states:** sections render only when they have content (discoverability of
  folder-favoriting comes from the star on folder headers).
- **Renamed/removed categories:** a folder favorite keyed by name simply stops
  matching if the category disappears; it is ignored (no crash). Acceptable.

## Testing

- **Backend (unit):**
  - `favorites` add / remove / get round-trip with `itemType='category'`.
  - `GET /api/favorites?itemType=category` returns only category favorites.
  - History GET returns rows with `item_type='channel'` and recency ordering.
- **Frontend (manual, in-app):**
  - Star a folder → it appears under `⭐ Favorites`; unstar → it disappears.
  - Favorited channel still appears under Favorites (no regression).
  - Watch a live channel → it appears under `🕘 Recently Watched`; watch another →
    ordering updates, de-duped.
  - Reload → folder favorites persist (server) and section collapse persists (local).
  - Source filter narrows Favorites/Recents correctly.

## Out of scope

- Reordering favorites by drag.
- Unified live+VOD recents (Home page recents unchanged).
- Recents retention/cleanup policy beyond the existing history behavior.
