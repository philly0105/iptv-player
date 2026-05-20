# Multiview — Design Spec

**Date:** 2026-05-18
**Scope:** Desktop only. Live TV channels only. Max 4 simultaneous streams.

---

## Goal

Watch up to 4 live TV channels simultaneously in a grid layout. Two layout options: equal 2×2 grid and 1+3 (one large panel, three small). Click a panel to give it audio focus. Channels can be assigned from empty slots or from the channel list.

---

## Constraints

- **No mobile** — multiview is desktop-only; the nav entry and page are hidden on narrow viewports
- **No transcoding** — slots support direct-play and proxy streams only; channels that require transcoding show an unsupported message
- **No persistence** — slot state is not saved between visits; the page opens empty each time
- **No VOD** — live TV channels only

---

## Architecture

### New files

| File | Responsibility |
|---|---|
| `public/js/components/StreamSlot.js` | Self-contained slot: owns one `<video>`, one HLS.js instance, all slot-level state and UI |
| `public/js/pages/MultiviewPage.js` | Page controller: manages 4 slots, layout switching, audio focus, channel picker, nav wiring |

### Modified files

| File | Change |
|---|---|
| `public/index.html` | Add `<section id="page-multiview">` grid markup + nav entry |
| App router / nav | Register multiview page, add nav icon (hidden on mobile) |
| `public/js/pages/ChannelsPage.js` | Add "Add to Multiview" button and context menu item per channel |

**`VideoPlayer.js` and `WatchPage.js` are not touched.**

---

## StreamSlot Component

`StreamSlot` is a class (not a DOM singleton). Each instance creates and fully owns its DOM subtree.

### DOM structure (per slot)
```html
<div class="stream-slot" data-slot="N">
  <video playsinline></video>
  <div class="slot-loading hidden"><div class="loading-spinner"></div></div>
  <div class="slot-empty">
    <svg><!-- grid/add icon --></svg>
    <span>Add channel</span>
  </div>
  <div class="slot-error hidden">
    <span class="slot-error-msg"></span>
    <button class="slot-retry-btn">Retry</button>
  </div>
  <div class="slot-label hidden"></div>
  <div class="slot-focus-indicator hidden">
    <svg><!-- speaker icon --></svg>
  </div>
</div>
```

### Public API

```js
slot.load(channel)    // Load a channel; destroys previous HLS instance first
slot.unload()         // Destroy HLS, clear video src, show empty state
slot.focus()          // Unmute video, show focus indicator (speaker icon + border)
slot.unfocus()        // Mute video, hide focus indicator
slot.setSize(size)    // 'equal' | 'large' | 'small' — sets CSS size class
slot.getChannel()     // Returns currently loaded channel object, or null
slot.isEmpty()        // Returns true if no channel loaded
```

### HLS loading
- Uses the same `Hls` config as `WatchPage.playHls()` (shared constants)
- If `Hls.isSupported()` is false, falls back to native `video.src`
- On HLS fatal error: shows error state with retry button; retry calls `load(channel)` again

### Transcoding guard
Before calling `hls.loadSource(url)`, check if the URL passes through `/api/transcode`. If it does, show the slot error state with message "Transcoding not supported in multiview." The check: `url.includes('/api/transcode')`.

---

## MultiviewPage

### State
```js
this.slots = [];           // Array of 4 StreamSlot instances
this.focusedSlot = 0;      // Index of slot with audio (default 0)
this.layout = 'grid';      // 'grid' (2×2) | 'focus' (1+3)
this.pickerSlot = null;    // Index of slot the picker is open for, or null
this.pendingChannel = null; // Channel queued from the channel list
```

### Layout

Two CSS classes on the grid container:

**`layout-grid`** (2×2): All 4 slots equal size in a 2-column CSS grid.

**`layout-focus`** (1+3): Slot 0 occupies the left 2/3 (`slot.setSize('large')`), slots 1–3 stack vertically on the right (`slot.setSize('small')`).

A layout toggle button in the top bar switches between them. Layout switching does not reload streams.

### Audio focus

`focusSlot(index)`:
1. Call `this.slots[this.focusedSlot].unfocus()`
2. Set `this.focusedSlot = index`
3. Call `this.slots[index].focus()`

On page enter, `focusSlot(0)` is called automatically.

Clicking anywhere on a slot (but not on its internal buttons) triggers `focusSlot(i)`.

### Channel picker

A single shared overlay panel (`#multiview-picker`):
- Searchable list of live TV channels from the existing channels API
- Opened by: clicking an empty slot, or clicking a "change" button on a loaded slot
- Closes on: channel selected, clicking outside, pressing Escape
- On channel selected: calls `this.slots[this.pickerSlot].load(channel)`, closes picker

The picker fetches live channels directly from the existing `/api/channels` endpoint (same call `ChannelsPage` makes) and renders them in a scrollable list with a text filter input.

### Page lifecycle

**On enter (`show()`):**
1. If `this.pendingChannel !== null`: load it into the first empty slot (or slot 0), clear `pendingChannel`
2. `focusSlot(0)`

**On leave (`hide()`):**
1. Call `slot.unload()` on all 4 slots

### queueChannel(channel)
Called by the channel list before navigating to multiview:
```js
queueChannel(channel) {
    this.pendingChannel = channel;
}
```
On page enter, the pending channel is loaded into the first empty slot.

---

## Channel List Integration

### "Add to Multiview" button
- A small grid icon button added to each live channel row/card
- Visible on hover (desktop)
- On click: `app.pages.multiview.queueChannel(channel)` → `app.navigateTo('multiview')`
- Only shown for live channels (not VOD)

### Context menu item
- Right-click on a channel adds "Open in Multiview" to the existing context/overflow menu
- Same behaviour: queue + navigate

### Slot selection
When `queueChannel` is called, the channel loads into the **first empty slot** on page enter. If all 4 slots are occupied, it loads into slot 0 (replacing it). No slot picker dialog — keeping it simple.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| HLS fatal network error | Slot shows error state + retry button |
| Channel requires transcoding | Slot shows "Not supported in multiview" message |
| Channel URL is empty/invalid | Slot shows error state immediately |
| All slots occupied when queuing | Replaces slot 0 |
| HLS.js not supported | Falls back to native `video.src` |

---

## What's Not Included

- Mobile layout
- Transcoding support
- State persistence between visits
- VOD support
- Drag-to-reorder slots
- Fullscreen on individual slots (use single-stream live TV for that)
