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

- **Layout:** Top of the Live TV list, in order:
  1. `🕘 Recently Watched` — a bespoke pinned, collapsible section (live channels).
  2. **Favorited folders pinned in place** — favorited categories float to the top
     as ordinary collapsible folders, each marked with a filled ⭐. They are *not*
     wrapped in an extra "Favorites" header; they reuse the existing group renderer
     untouched (this is the lower-risk option chosen over nesting sub-folders inside
     a Favorites wrapper — same user value, far less churn in a hot batched renderer).
  3. `⭐ Favorites` — the existing synthetic group holding favorited **channels**
     (unchanged behavior).
  4. Normal folders, alphabetical.
- **Favorite scope:** Folders **and** channels. Existing per-channel favorites are
  kept exactly as-is (their own `⭐ Favorites` group). Folder favorites are a new,
  separate mechanism that pins whole categories.
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
- `source_id` = **sentinel `0`**. Groups are keyed by name only in the UI (the same
  category name can aggregate channels from multiple sources under "All Sources"),
  and `collapsedGroups` is name-keyed. Using a fixed `source_id = 0` makes folder
  favorites name-identified, matching the UI's grouping/collapse model. The column
  is `INTEGER NOT NULL`, so `0` is valid.

No schema migration needed. Only the route validation enum changes.

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
  `itemType=category` favorites into a `Set<categoryName>` (`this.favoriteFolders`).
  (Keyed by name only — see Data model sentinel `source_id = 0`.)
- **Folder favorite API:** `isFolderFavorite(categoryName)` and
  `toggleFolderFavorite(categoryName)` — POST/DELETE `/api/favorites` with
  `sourceId:'0', itemId:categoryName, itemType:'category'`; optimistic update of the
  Set, then re-sort + re-render the list.
- **Pin favorited folders in place:** in `render()`, the group sort comparator ranks
  groups — favorited folders first (rank 0), the channel `Favorites` group next
  (rank 1), all others alphabetical (rank 2). The default-collapse pass skips
  favorited folders so they start expanded.
- **Star on folder header:** render a ⭐ toggle button in each `.group-header`
  (filled when favorited), `stopPropagation` on click so it doesn't collapse/expand
  the folder.
- **🕘 Recently Watched section:** a bespoke block prepended to `listContainer`
  (outside the batched group list). Fetch `GET /api/history?limit=50`, filter
  `item_type==='channel'`, de-dupe by `sourceId:itemId` keeping newest, take 10.
  Render each row (logo + name + relative time "2m ago"); click calls
  `selectChannel({ channelId, sourceId })`. Collapsible; collapse state in
  `localStorage` under a reserved key. Hidden when empty.
- **Recents tracking hook:** in `selectChannel()`, after the channel is resolved,
  fire a one-shot `POST /api/history` (see WatchPage note — implemented here, not in
  WatchPage, since live playback is launched from `selectChannel`).
- **Source filter:** pinned folders and the channel `Favorites` group already follow
  the active source filter (they derive from `this.channels`). Recents show all
  fetched live entries; when a single source is selected, recents whose `sourceId`
  isn't the selected source are still listed but may not re-resolve a stream until
  that source is active (acceptable — the user normally runs one source).

### WatchPage.js

- No change required. Live playback is launched via `ChannelList.selectChannel()`,
  which is where the `type:'channel'` history POST is fired. `saveProgress` (which
  skips live) is left untouched.

## Edge cases

- **Play from recents:** a recents row calls `selectChannel({ channelId, sourceId })`,
  which resolves a fresh stream URL (it does not replay a stored, possibly-expired
  URL). If the recent's source isn't in the currently loaded channel set,
  `selectChannel` is a no-op — acceptable given single-source usage.
- **De-dupe:** recents de-duped by `sourceId:itemId`, newest kept.
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
  - Star a folder → it jumps to the top with a filled ⭐ and starts expanded; unstar
    → it returns to alphabetical position.
  - Favorited channels still appear in the `⭐ Favorites` group (no regression).
  - Watch a live channel → it appears in `🕘 Recently Watched`; watch another →
    ordering updates, de-duped.
  - Reload → folder favorites persist (server) and section collapse persists (local).
  - Clicking a recents row plays the channel.

## Out of scope

- Reordering favorites by drag.
- Unified live+VOD recents (Home page recents unchanged).
- Recents retention/cleanup policy beyond the existing history behavior.
