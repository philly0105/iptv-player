# VOD Quality Picker — Design Spec

**Date:** 2026-05-17
**Scope:** Movies and series player (`WatchPage.js`) only. Live TV player (`VideoPlayer.js`) is out of scope.

---

## Goal

Let users choose video quality while watching a movie or series. The picker is context-aware:

- **HLS mode** — when the source stream's manifest contains multiple renditions, show those levels and switch instantly (no restart, no re-encode).
- **Transcode mode** — when the stream has only one rendition (or is already being transcoded), show fixed presets (1080p / 720p / 480p) and restart the transcode session at the chosen resolution from the current playback position.

---

## Entry Points

Two ways to open the picker — both open the same dropdown:

1. **Quality button** in the bottom control bar (between captions and PiP). Hidden until quality options are available.
2. **Quality badge** in the top-right corner (e.g. "1080p") — already exists as `#watch-quality-badge`; becomes tappable.

---

## Architecture

### Files changed

| File | Change |
|---|---|
| `public/index.html` | Add quality button + dropdown markup inside the VOD control bar |
| `public/js/pages/WatchPage.js` | Quality selection logic (new methods + hooks into existing `playHls`) |
| `server/routes/transcode.js` | Accept `maxResolution` / `quality` overrides in `POST /api/transcode/session` body |

No new files. No changes to `VideoPlayer.js`, live TV routes, or the database schema.

---

## UI Structure

The quality picker reuses the existing captions button pattern — a wrapper div containing a toggle button and a dropdown menu:

```html
<!-- inserted after .watch-captions-wrapper, before #watch-pip -->
<div class="watch-captions-wrapper" id="watch-quality-wrapper">
  <button class="watch-btn" id="watch-quality-btn" title="Quality">
    <!-- settings/HD SVG icon -->
  </button>
  <div class="watch-captions-menu hidden" id="watch-quality-menu">
    <div class="captions-menu-title">Quality</div>
    <div class="captions-menu-list" id="watch-quality-list">
      <!-- populated dynamically -->
    </div>
  </div>
</div>
```

- The button starts `display:none` and is shown only when ≥ 2 options exist.
- Menu items use the existing `.captions-option` class and `.active` for the selected item.
- Clicking outside the menu (or pressing the button again) closes it — same dismiss logic as the captions menu.

---

## WatchPage.js Logic

### New instance state

```js
this.qualityMode = null;          // 'hls' | 'transcode'
this.currentQuality = null;       // -1 (HLS auto) | level index | '1080p' | '720p' | '480p' | 'auto'
this.lastTranscodeOptions = {};   // options from the most recent startTranscodeSession call
```

### Hook into playHls()

After the existing `MANIFEST_PARSED` handler, call `this.populateQualityMenu()`.

### populateQualityMenu()

```
levels = this.hls.levels
if levels.length > 1:
    qualityMode = 'hls'
    items = [ {label:'Auto', value:-1}, ...levels.map(height label + index) ]
else:
    qualityMode = 'transcode'
    items = [ {label:'Auto', value:'auto'}, {label:'1080p'}, {label:'720p'}, {label:'480p'} ]

render items into #watch-quality-list
show/hide #watch-quality-btn based on items.length > 1
mark currentQuality as active
```

### selectQuality(value)

```
close menu
mark item active in UI

if qualityMode === 'hls':
    hls.currentLevel = value   // -1 = adaptive auto; instant, no restart

if qualityMode === 'transcode':
    seekTime = video.currentTime
    stop existing transcode session
    show loading spinner
    options = { ...lastTranscodeOptions, seekOffset: seekTime }
    if value !== 'auto': options.maxResolution = value
    playlistUrl = await startTranscodeSession(streamUrl, options)
    playHls(playlistUrl)
    // MANIFEST_PARSED fires → populateQualityMenu() runs → menu rebuilt, active item restored
```

### lastTranscodeOptions

Populated in `startTranscodeSession()` by storing whatever `options` was passed in (videoMode, videoCodec, audioCodec, audioChannels). This ensures a quality switch reuses the same transcode configuration, only overriding resolution.

---

## Server Change — transcode.js

`POST /api/transcode/session` currently reads `maxResolution` and `quality` exclusively from DB settings. Add body overrides:

```js
// Before (line 48–49):
maxResolution: settings.maxResolution || '1080p',
quality: settings.quality || 'medium',

// After:
maxResolution: req.body.maxResolution || settings.maxResolution || '1080p',
quality: req.body.quality || settings.quality || 'medium',
```

No other server changes needed.

---

## Error Handling

- If `startTranscodeSession` fails during a quality switch, hide the spinner and leave the previous stream playing (don't blank the player).
- If HLS manifest has no height info for a level, fall back to `Level N` as the label.
- If quality menu is opened during a loading/buffering state, it still works — selecting transcode preset is a no-op guard against double-start (the loading spinner is already shown).

---

## What's Not Changing

- The live TV player (`VideoPlayer.js`) — out of scope.
- The quality badge update logic (`updateQualityBadge`) — still driven by `loadedmetadata`, unchanged.
- The transcode status badge — still updated the same way; a quality switch triggers the same `updateTranscodeStatus` call.
- The auto-probe logic in `loadVideo` — unchanged; quality switching bypasses it (uses stored `lastTranscodeOptions`).
