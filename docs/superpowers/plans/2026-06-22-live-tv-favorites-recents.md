# Live TV — Folder Favorites & Recently Watched Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Live TV tab favorite whole folders (categories) and surface a "Recently Watched" live-channel list, both pinned at the top.

**Architecture:** Reuse existing per-user SQLite stores — the `favorites` table gains an `itemType: 'category'` value (folder favorites, keyed by category name via sentinel `source_id = 0`); the `watch_history` table gains live-channel rows written on play-start. The frontend `ChannelList.js` pins favorited folders to the top of its existing batched group renderer (no nesting), adds a ⭐ star toggle on folder headers, and prepends a bespoke "Recently Watched" section. `selectChannel()` fires a one-shot history POST for live channels.

**Tech Stack:** Node.js + Express, better-sqlite3, vanilla-JS frontend (no build step). Tests via Node's built-in `node:test` runner (zero new dependencies).

## Global Constraints

- No new npm dependencies. Tests use the built-in `node:test` runner (`node --test`).
- Folder favorites are stored in the existing `favorites` table with `item_type = 'category'`, `source_id = 0` (sentinel), `item_id = <category name>`. No schema migration.
- Live recents reuse the existing `watch_history` table and the existing `POST /api/history` route — no new routes, no schema change.
- Frontend is served statically; there is no bundler. Edit `public/js/**` files directly; they load as plain scripts.
- Match existing code style in each file (4-space indent in `server/`, the existing patterns in `ChannelList.js`). Do not refactor unrelated code.
- The existing channel `Favorites` group (favorited *channels*) must keep working unchanged.

---

## File Structure

- `server/routes/favorites.js` — **modify**: add `'category'` to the `itemType` enum in the POST and DELETE `validateBody` schemas.
- `server/db/__tests__/favorites.category.test.js` — **create**: `node:test` coverage for `favorites` store with `item_type='category'`.
- `public/js/api.js` — **modify**: add an `API.history` namespace (`getAll`, `record`).
- `public/js/components/ChannelList.js` — **modify**: load folder favorites; `isFolderFavorite`/`toggleFolderFavorite`; rank-sort to pin favorited folders; ⭐ star on group headers; bespoke Recently Watched section; one-shot history POST in `selectChannel`.
- `public/css/*` — **modify**: minimal styles for the folder star + recents rows (locate the existing stylesheet that styles `.group-header`/`.favorite-btn`).

---

## Task 1: Allow `'category'` favorites in the backend route

**Files:**
- Modify: `server/routes/favorites.js` (the `itemType` enum in the POST handler ~line 26 and DELETE handler ~line 44)
- Test: `server/db/__tests__/favorites.category.test.js` (create)

**Interfaces:**
- Consumes: existing `favorites` store from `server/db/sqlite.js` — `favorites.add(userId, sourceId, itemId, itemType)`, `favorites.remove(...)`, `favorites.getAll(userId, sourceId=null, itemType=null)`, `favorites.isFavorite(...)`. These already accept any `itemType` string; only the HTTP-route validation blocks `'category'`.
- Produces: `POST /api/favorites` and `DELETE /api/favorites` accept `itemType: 'category'`. No signature changes to the store.

- [ ] **Step 1: Write the failing test**

The `favorites` store already accepts arbitrary `item_type`, so this test pins the behavior we depend on (category round-trip + type filtering) and will fail only if the store path is wrong. Create `server/db/__tests__/favorites.category.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Point the sqlite module at a throwaway DB file before requiring it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-fav-'));
process.env.IPTV_DATA_DIR = tmpDir;

const { favorites } = require('../sqlite');

test('category favorites round-trip and filter by item_type', () => {
  const userId = 1;
  const sourceId = 0; // sentinel for folder favorites
  const name = '|NA| USA MLB';

  assert.equal(favorites.isFavorite(userId, sourceId, name, 'category'), false);

  assert.equal(favorites.add(userId, sourceId, name, 'category'), true);
  assert.equal(favorites.isFavorite(userId, sourceId, name, 'category'), true);

  // Adding a channel favorite must not show up under category filter.
  favorites.add(userId, 5, '123', 'channel');
  const cats = favorites.getAll(userId, null, 'category');
  assert.equal(cats.length, 1);
  assert.equal(cats[0].item_id, name);
  assert.equal(cats[0].item_type, 'category');

  assert.equal(favorites.remove(userId, sourceId, name, 'category'), true);
  assert.equal(favorites.isFavorite(userId, sourceId, name, 'category'), false);
});

test.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });
```

- [ ] **Step 2: Make the test's DB path override work**

`server/db/sqlite.js` currently hardcodes `dataDir`. Add an env override so tests don't touch the real `content.db`. Change the top of `server/db/sqlite.js`:

```js
const dataDir = process.env.IPTV_DATA_DIR
    ? process.env.IPTV_DATA_DIR
    : path.join(__dirname, '..', '..', 'data');
```

(Leave the rest of the file unchanged.)

- [ ] **Step 3: Run the test to verify it passes (store already supports category)**

Run: `node --test server/db/__tests__/favorites.category.test.js`
Expected: PASS (2 tests). If it FAILS on the DB path, recheck Step 2.

- [ ] **Step 4: Add `'category'` to the route validation enum**

In `server/routes/favorites.js`, both the POST (`router.post('/', validateBody({...}))`) and DELETE (`router.delete('/', validateBody({...}))`) schemas have:

```js
itemType: { type: 'string', enum: ['channel', 'movie', 'series'], default: 'channel' },
```

Change both to:

```js
itemType: { type: 'string', enum: ['channel', 'movie', 'series', 'category'], default: 'channel' },
```

- [ ] **Step 5: Manually verify the route accepts category**

Start the server (`npm start`) logged in, then from the browser console (already authed):

```js
await API.request('POST', '/favorites', { sourceId: '0', itemId: 'TEST CAT', itemType: 'category' });
await API.request('GET', '/favorites?itemType=category');   // includes TEST CAT
await API.request('DELETE', '/favorites', { sourceId: '0', itemId: 'TEST CAT', itemType: 'category' });
```

Expected: POST returns `{success:true}`, GET lists the item, DELETE returns `{success:true}`. Before this change the POST returned a 400 validation error.

- [ ] **Step 6: Commit**

```bash
git add server/routes/favorites.js server/db/sqlite.js server/db/__tests__/favorites.category.test.js
git commit -m "feat(favorites): allow category (folder) favorites in API + test"
```

---

## Task 2: Add `API.history` client namespace

**Files:**
- Modify: `public/js/api.js` (add a `history` namespace alongside `favorites`, ~line 98)

**Interfaces:**
- Consumes: existing `API.request(method, endpoint, data)`.
- Produces:
  - `API.history.getAll(limit = 50)` → `GET /api/history?limit=<n>` → array of rows `{ id, user_id, source_id, item_type, item_id, parent_id, progress, duration, updated_at, data }` (`data` is parsed JSON).
  - `API.history.record(id, sourceId, data)` → `POST /api/history` with `{ id: String(id), type: 'channel', sourceId: String(sourceId), data }`.

- [ ] **Step 1: Add the namespace**

In `public/js/api.js`, immediately after the `favorites: { ... },` block (before `// Proxy`), insert:

```js
    // Watch history
    history: {
        getAll: (limit = 50) => API.request('GET', `/history?limit=${limit}`),
        record: (id, sourceId, data) =>
            API.request('POST', '/history', {
                id: String(id),
                type: 'channel',
                sourceId: sourceId != null ? String(sourceId) : undefined,
                data
            }),
    },
```

- [ ] **Step 2: Verify in the browser console (server running, logged in)**

```js
await API.history.record('test-1', 0, { title: 'Console Test', icon: '' });
(await API.history.getAll(50)).find(r => r.item_id === 'test-1');  // truthy, item_type 'channel'
await API.request('DELETE', '/history/test-1');                    // cleanup
```

Expected: `record` returns `{success:true, timestamp}`, the row is found with `item_type:'channel'`.

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat(api): add history client namespace (getAll, record)"
```

---

## Task 3: Record live-channel watches on play-start

**Files:**
- Modify: `public/js/components/ChannelList.js` (`selectChannel`, ends ~line 1216 with `window.app.player.play(...)`)

**Interfaces:**
- Consumes: `API.history.record(id, sourceId, data)` (Task 2); the resolved `channel` object inside `selectChannel` with fields `id`, `sourceId`, `name`, `tvgLogo`, `streamId`, `sourceType`; `this.loadRecents()` (defined in Task 6 — calling it here only refreshes the cache for the next render; if Tasks are done out of order, guard with `this.loadRecents?.()`).
- Produces: every live-channel selection writes a `watch_history` row with `item_type='channel'`. No new public method (a private `recordLiveWatch(channel)` helper).

- [ ] **Step 1: Add the helper method**

In `ChannelList.js`, add a method near `selectChannel` (e.g. right after it):

```js
    async recordLiveWatch(channel) {
        if (!channel) return;
        // Fire-and-forget; never block playback on history write.
        try {
            await API.history.record(channel.id, channel.sourceId, {
                title: channel.name,
                icon: channel.tvgLogo || '',
                streamId: channel.streamId || '',
                sourceType: channel.sourceType || ''
            });
            // Refresh the recents cache so it's fresh next time the list renders.
            if (this.loadRecents) await this.loadRecents();
        } catch (err) {
            console.warn('[History] Failed to record live watch:', err);
        }
    }
```

- [ ] **Step 2: Call it from `selectChannel`**

In `selectChannel`, find the play block at the end:

```js
        // Play channel
        if (window.app?.player) {
            window.app.player.play(channel, streamUrl);
        }
    }
```

Change it to:

```js
        // Play channel
        if (window.app?.player) {
            window.app.player.play(channel, streamUrl);
            this.recordLiveWatch(channel);
        }
    }
```

- [ ] **Step 3: Manually verify a watch is recorded**

Server running, logged in, on Live TV. Click a live channel to play it, then in the console:

```js
(await API.history.getAll(50)).filter(r => r.item_type === 'channel');
```

Expected: an entry for the just-played channel with `data.title` = the channel name and a recent `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add public/js/components/ChannelList.js
git commit -m "feat(live): record live-channel watches to history on play"
```

---

## Task 4: Folder-favorite state + ⭐ star on folder headers

**Files:**
- Modify: `public/js/components/ChannelList.js` (constructor ~line 20; `loadFavorites` ~line 910; `renderNextBatch` group-header markup ~line 481-487 and `attachGroupListeners` ~line 561; the `renderGroupChannels` header path if it also emits a header — verify)
- Modify: `public/css/<stylesheet that styles .group-header>` (add `.folder-fav-btn` styles)

**Interfaces:**
- Consumes: `API.favorites.getAll(null, 'category')`, `API.favorites.add('0', name, 'category')`, `API.favorites.remove('0', name, 'category')`; `Icons.favorite` / `Icons.favoriteOutline` (already used for channel stars).
- Produces:
  - `this.favoriteFolders` — `Set<string>` of favorited category names.
  - `isFolderFavorite(name) → boolean`
  - `toggleFolderFavorite(name) → Promise<void>` (optimistic; updates Set, persists via API, then calls `this.render()`).
  - Each `.group-header` (non-Favorites) renders a `.folder-fav-btn` reflecting favorite state.

- [ ] **Step 1: Initialize the Set in the constructor**

Find in the constructor (~line 20):

```js
        this.favorites = []; // Array of favorite objects
        this.visibleFavorites = new Set(); // Set<"sourceId:channelId">
```

Add right after:

```js
        this.favoriteFolders = new Set(); // Set<categoryName> of favorited folders
```

- [ ] **Step 2: Load folder favorites alongside channel favorites**

Replace the body of `loadFavorites` (~line 910-922) with:

```js
    async loadFavorites() {
        try {
            // Channel favorites (existing behavior)
            const allFavs = await API.favorites.getAll();
            const channelFavs = allFavs.filter(f => !f.item_type || f.item_type === 'channel');
            this.visibleFavorites = new Set(
                channelFavs.map(f => `${f.source_id}:${f.item_id || f.channel_id}`)
            );

            // Folder (category) favorites — keyed by name only
            const folderFavs = await API.favorites.getAll(null, 'category');
            this.favoriteFolders = new Set(folderFavs.map(f => f.item_id));
        } catch (err) {
            console.error('Error loading favorites:', err);
        }
    }
```

- [ ] **Step 3: Add isFolderFavorite / toggleFolderFavorite**

Add these methods right after `loadFavorites`:

```js
    isFolderFavorite(name) {
        return this.favoriteFolders.has(name);
    }

    async toggleFolderFavorite(name) {
        const wasFav = this.favoriteFolders.has(name);
        // Optimistic
        if (wasFav) this.favoriteFolders.delete(name);
        else this.favoriteFolders.add(name);
        // Re-render so the folder re-pins/un-pins and the star updates.
        this.render();
        try {
            if (wasFav) await API.favorites.remove('0', name, 'category');
            else await API.favorites.add('0', name, 'category');
        } catch (err) {
            console.error('Error toggling folder favorite:', err);
            // Revert
            if (wasFav) this.favoriteFolders.add(name);
            else this.favoriteFolders.delete(name);
            this.render();
        }
    }
```

- [ ] **Step 4: Render the star button in the group header**

In `renderNextBatch`, find the header markup (~line 481-487):

```js
          <div class="group-header ${this.collapsedGroups.has(groupName) ? 'collapsed' : ''} ${isFavoritesGroup ? 'favorites-group' : ''}" data-group="${groupName}">
            <span class="group-toggle">${Icons.chevronDown}</span>
            <span class="group-name">${groupName}</span>
            <span class="group-count">${visibleChannels.length}</span>
          </div>
```

Replace with (adds a star button for real folders, not the synthetic channel-Favorites group):

```js
          <div class="group-header ${this.collapsedGroups.has(groupName) ? 'collapsed' : ''} ${isFavoritesGroup ? 'favorites-group' : ''} ${this.isFolderFavorite(groupName) ? 'folder-favorited' : ''}" data-group="${groupName}">
            <span class="group-toggle">${Icons.chevronDown}</span>
            <span class="group-name">${groupName}</span>
            <span class="group-count">${visibleChannels.length}</span>
            ${isFavoritesGroup ? '' : `<button class="folder-fav-btn ${this.isFolderFavorite(groupName) ? 'active' : ''}" title="${this.isFolderFavorite(groupName) ? 'Unpin folder' : 'Pin folder to top'}">${this.isFolderFavorite(groupName) ? Icons.favorite : Icons.favoriteOutline}</button>`}
          </div>
```

- [ ] **Step 5: Wire the star click in `attachGroupListeners`**

In `attachGroupListeners` (~line 561), the header click handler currently toggles collapse. Add a star handler that stops propagation. After the `header.addEventListener('click', ...)` block but still inside `attachGroupListeners` (where `header` is in scope), add:

```js
        const folderFavBtn = groupEl.querySelector('.group-header .folder-fav-btn');
        if (folderFavBtn) {
            folderFavBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const groupName = groupEl.querySelector('.group-header').dataset.group;
                this.toggleFolderFavorite(groupName);
            });
        }
```

- [ ] **Step 6: Add minimal CSS**

Find the stylesheet that defines `.favorite-btn` / `.group-header` (search `public/css` for `.group-header`). Append:

```css
.group-header .folder-fav-btn {
  margin-left: 8px;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.45;
  color: inherit;
  display: inline-flex;
  align-items: center;
  padding: 2px;
}
.group-header:hover .folder-fav-btn { opacity: 0.8; }
.group-header .folder-fav-btn.active { opacity: 1; color: #f5a623; }
```

- [ ] **Step 7: Manually verify the star renders and persists**

Server running, logged in, Live TV with at least one folder. Hover a folder header → star appears. Click the star → it fills (active). Reload the page → the star is still filled (loaded from server). (Pinning to top is Task 5; for now just confirm state + persistence.)

- [ ] **Step 8: Commit**

```bash
git add public/js/components/ChannelList.js public/css
git commit -m "feat(live): folder-favorite state and star toggle on folder headers"
```

---

## Task 5: Pin favorited folders to the top of the list

**Files:**
- Modify: `public/js/components/ChannelList.js` (`render`: group sort comparator ~line 345-349, and default-collapse pass ~line 368-376)

**Interfaces:**
- Consumes: `this.favoriteFolders` (Task 4), existing `this.sortedGroups` pipeline.
- Produces: in the rendered list, favorited folders appear first (rank 0), then the channel `Favorites` group (rank 1), then the rest alphabetically (rank 2). Favorited folders are not auto-collapsed.

- [ ] **Step 1: Rank-sort the groups**

In `render`, replace the sort (~line 345-349):

```js
        const allGroups = Object.keys(groupedChannels).sort((a, b) => {
            if (a === 'Favorites') return -1;
            if (b === 'Favorites') return 1;
            return a.localeCompare(b);
        });
```

with a ranked sort:

```js
        const groupRank = (name) => {
            if (this.isFolderFavorite(name)) return 0; // pinned favorited folders
            if (name === 'Favorites') return 1;        // favorited-channels group
            return 2;                                  // everything else
        };
        const allGroups = Object.keys(groupedChannels).sort((a, b) => {
            const ra = groupRank(a), rb = groupRank(b);
            if (ra !== rb) return ra - rb;
            return a.localeCompare(b);
        });
```

- [ ] **Step 2: Keep favorited folders expanded by default**

In the default-collapse pass (~line 368-376):

```js
        if (!this._hasCollapsedState && this.sortedGroups.length > 0) {
            this.sortedGroups.forEach(groupName => {
                if (groupName !== 'Favorites') {
                    this.collapsedGroups.add(groupName);
                }
            });
            this._hasCollapsedState = true;
            this.saveCollapsedState();
        }
```

change the condition so favorited folders also stay expanded:

```js
        if (!this._hasCollapsedState && this.sortedGroups.length > 0) {
            this.sortedGroups.forEach(groupName => {
                if (groupName !== 'Favorites' && !this.isFolderFavorite(groupName)) {
                    this.collapsedGroups.add(groupName);
                }
            });
            this._hasCollapsedState = true;
            this.saveCollapsedState();
        }
```

Also, in `renderNextBatch` the per-group "default new groups to collapsed" guard (~line 477) should not collapse a freshly-favorited folder. Find:

```js
            if (!isFavoritesGroup && !this.collapsedGroups.has(groupName) && !this._userExpandedGroups?.has(groupName)) {
                this.collapsedGroups.add(groupName);
            }
```

Change the condition to also skip favorited folders:

```js
            if (!isFavoritesGroup && !this.isFolderFavorite(groupName) && !this.collapsedGroups.has(groupName) && !this._userExpandedGroups?.has(groupName)) {
                this.collapsedGroups.add(groupName);
            }
```

- [ ] **Step 3: Manually verify pinning**

Server running, logged in, Live TV. Star a folder several entries down → it jumps to the top of the list and is expanded; its header shows a filled ⭐. Unstar it → it drops back into alphabetical position. The channel `Favorites` group (if you have favorited channels) sits just below the pinned folders. Reload → pinned folders are still at top.

- [ ] **Step 4: Commit**

```bash
git add public/js/components/ChannelList.js
git commit -m "feat(live): pin favorited folders to top of channel list"
```

---

## Task 6: Recently Watched section

**Files:**
- Modify: `public/js/components/ChannelList.js` (constructor ~line 20 add `this.recentsData = []`; the two channel-load `Promise.all` sites ~line 762-765 and ~line 798-801 add `this.loadRecents()`; `render` — prepend the section after `listContainer` is created ~line 416-418; add `loadRecents`, `renderRecentlyWatched`, `formatRelativeTime`)
- Modify: `public/css/<same stylesheet>` (styles for `.recently-watched`, `.recent-item`)

**Interfaces:**
- Consumes: `API.history.getAll(50)` (Task 2); `selectChannel({ channelId, sourceId })`; `Icons.chevronDown`; `localStorage`; `this.searchInput.value`.
- Produces:
  - `this.recentsData` — cached array of up to 10 de-duped live history rows (newest first).
  - `loadRecents() → Promise<void>` — fetches history and populates `this.recentsData`.
  - `renderRecentlyWatched(listContainer)` — **synchronous**; reads `this.recentsData`, renders only when the search box is empty; prepends a `.recently-watched` block. Section collapse persisted under `localStorage['iptv_player_recents_collapsed']`.

- [ ] **Step 1: Add the cache field + load calls**

In the constructor (~line 20), after `this.favoriteFolders = new Set();` (Task 4), add:

```js
        this.recentsData = []; // Cached recent live-channel history rows (deduped, newest first)
```

In `loadChannels` (~line 762-765) change:

```js
            await Promise.all([
                this.loadHiddenItems(),
                this.loadFavorites()
            ]);
```

to:

```js
            await Promise.all([
                this.loadHiddenItems(),
                this.loadFavorites(),
                this.loadRecents()
            ]);
```

Make the identical change in `loadAllChannels` (~line 798-801).

- [ ] **Step 2: Add `loadRecents` (fetch + de-dupe into cache)**

`updated_at` is stored as epoch ms by the history route; history is returned `ORDER BY updated_at DESC`. Add to `ChannelList.js`:

```js
    async loadRecents() {
        try {
            const history = await API.history.getAll(50);
            const live = (history || []).filter(r => r.item_type === 'channel');
            const seen = new Set();
            const rows = [];
            for (const r of live) {
                const key = `${r.source_id}:${r.item_id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rows.push(r);
                if (rows.length >= 10) break;
            }
            this.recentsData = rows;
        } catch (err) {
            console.warn('[Recents] Failed to load history:', err);
        }
    }
```

- [ ] **Step 3: Add a relative-time formatter**

Add to `ChannelList.js`:

```js
    formatRelativeTime(ts) {
        const diff = Date.now() - Number(ts);
        if (!isFinite(diff) || diff < 0) return '';
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.floor(h / 24);
        return d === 1 ? 'yesterday' : `${d}d ago`;
    }
```

- [ ] **Step 4: Add the recents renderer (synchronous, reads cache)**

Add to `ChannelList.js`. It reads `this.recentsData` (populated by `loadRecents`) and builds DOM into the passed container. It renders nothing while a search term is active (recents only make sense in the default view).

```js
    renderRecentlyWatched(listContainer) {
        // Only show recents in the default (non-search) view.
        if (this.searchInput && this.searchInput.value.trim()) return;
        const rows = this.recentsData || [];
        if (rows.length === 0) return;

        const collapsed = localStorage.getItem('iptv_player_recents_collapsed') === '1';
        const section = document.createElement('div');
        section.className = 'channel-group recently-watched';
        section.innerHTML = `
          <div class="group-header recents-header ${collapsed ? 'collapsed' : ''}">
            <span class="group-toggle">${Icons.chevronDown}</span>
            <span class="group-name">Recently Watched</span>
            <span class="group-count">${rows.length}</span>
          </div>
          <div class="group-channels recents-body" ${collapsed ? 'style="display:none"' : ''}>
            ${rows.map(r => {
              const d = r.data || {};
              const title = (d.title || r.item_id || 'Unknown');
              const icon = d.icon || '';
              return `
                <div class="channel-item recent-item" data-channel-id="${r.item_id}" data-source-id="${r.source_id}">
                  <img class="channel-logo" src="${this.getProxiedImageUrl(icon)}" alt="" onerror="this.onerror=null;this.src='/img/placeholder.png'">
                  <div class="channel-info">
                    <div class="channel-name">${this.escapeHtml(title)}</div>
                    <div class="channel-program">${this.formatRelativeTime(r.updated_at)}</div>
                  </div>
                </div>`;
            }).join('')}
          </div>`;

        // Collapse toggle
        section.querySelector('.recents-header').addEventListener('click', () => {
            const body = section.querySelector('.recents-body');
            const nowCollapsed = !section.querySelector('.recents-header').classList.contains('collapsed');
            section.querySelector('.recents-header').classList.toggle('collapsed', nowCollapsed);
            body.style.display = nowCollapsed ? 'none' : '';
            localStorage.setItem('iptv_player_recents_collapsed', nowCollapsed ? '1' : '0');
        });

        // Row click → play
        section.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectChannel({ channelId: item.dataset.channelId, sourceId: item.dataset.sourceId });
            });
        });

        listContainer.prepend(section);
    }
```

- [ ] **Step 5: Guard `selectChannel` against missing channels**

`selectChannel` already starts with `const channel = this.channels.find(c => c.id === dataset.channelId); if (!channel) return;` — so a recents click for a not-currently-loaded channel is a safe no-op. Confirm that line is present (~line 1121-1122); no code change if so.

- [ ] **Step 6: Call the renderer from `render`**

In `render`, just after the list container is created and appended (~line 416-418):

```js
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'channel-list-content';
        this.container.appendChild(this.listContainer);
```

add:

```js
        // Prepend Recently Watched from cache (synchronous; no-op while searching).
        this.renderRecentlyWatched(this.listContainer);
```

- [ ] **Step 7: Add CSS**

Append to the same stylesheet as Task 4:

```css
.recently-watched .recents-header .group-name { font-weight: 600; }
.recent-item { cursor: pointer; }
```

- [ ] **Step 8: Manually verify recents**

Server running, logged in. Play two different live channels, then return to the Live TV list (or trigger a re-render by switching tabs and back). Expected: a "Recently Watched" section at the very top listing those channels, newest first, with "just now"/"Nm ago" times. Click a row → it plays. Collapse the section, reload → it stays collapsed. Play one of the listed channels again → it moves to the top and is not duplicated. Type in the search box → the recents section disappears; clear search → it returns.

- [ ] **Step 9: Commit**

```bash
git add public/js/components/ChannelList.js public/css
git commit -m "feat(live): add Recently Watched section to channel list"
```

---

## Task 7: Full-flow verification & spec sign-off

**Files:** none (verification only)

- [ ] **Step 1: Run the backend test**

Run: `node --test server/db/__tests__/favorites.category.test.js`
Expected: PASS.

- [ ] **Step 2: End-to-end manual pass (server running, logged in, Live TV)**

- [ ] Star a folder → pins to top, filled ⭐, expanded. Unstar → returns to alphabetical.
- [ ] Existing channel favorites still appear in the `⭐ Favorites` group (no regression).
- [ ] Play two live channels → both appear in Recently Watched, newest first, de-duped.
- [ ] Click a Recently Watched row → channel plays.
- [ ] Reload → folder favorites persist (server), recents persist (server), recents collapse state persists (local).

- [ ] **Step 3: Confirm no console errors** during the above flow.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(live): verification fixes for favorites & recents"
```

---

## Self-Review notes

- **Spec coverage:** category favorites API (Task 1) ✓; `source_id=0` sentinel (Task 1 test + Task 4) ✓; live recents tracking on play-start (Task 3) ✓; folder-favorite state + star (Task 4) ✓; pin-in-place sort, no nesting (Task 5) ✓; Recently Watched section, de-dupe, relative time, click-to-play, collapse persistence (Task 6) ✓; channel `Favorites` group untouched (Tasks 4–5 explicitly exclude `isFavoritesGroup`) ✓.
- **No new deps / no migration:** honored (Global Constraints).
- **Type consistency:** `favoriteFolders: Set<string>`, `isFolderFavorite(name)`, `toggleFolderFavorite(name)`, `API.history.getAll/record`, `recordLiveWatch(channel)`, `renderRecentlyWatched(listContainer)`, `formatRelativeTime(ts)` used consistently across tasks.
- **Known limitation (documented in spec):** a recents row whose source isn't in the currently loaded channel set is a no-op on click; acceptable for single-source usage.
