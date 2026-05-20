# VOD Quality Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quality selector to the movies/series player that shows HLS rendition levels (instant switching) when the stream has multiple renditions, and falls back to transcode presets (1080p / 720p / 480p, stream restart at current position) when it doesn't.

**Architecture:** The picker is a dropdown menu that follows the exact same HTML/CSS/JS pattern as the existing captions button. It is populated on every `MANIFEST_PARSED` event inside `playHls()` — deciding between HLS mode and transcode mode by inspecting `hls.levels.length`. One small server change lets the transcode session endpoint accept a `maxResolution` override in the request body.

**Tech Stack:** Vanilla JS (no framework), HLS.js 1.5.7, Express (Node.js server).

---

## File Map

| File | Change |
|---|---|
| `server/routes/transcode.js` | Accept `maxResolution` / `quality` body overrides (2 lines) |
| `public/index.html` | Add quality button + dropdown markup to VOD control bar |
| `public/js/pages/WatchPage.js` | Quality picker state, methods, and hooks |

---

## Task 1: Server — accept maxResolution/quality overrides in transcode session

**Files:**
- Modify: `server/routes/transcode.js:32` and `:48-49`

- [ ] **Step 1: Extend destructuring on line 32 to include the two new body fields**

In `server/routes/transcode.js`, find this line (currently line 32):
```js
const { url, seekOffset, videoMode, videoCodec, audioCodec, audioChannels } = req.body;
```
Replace with:
```js
const { url, seekOffset, videoMode, videoCodec, audioCodec, audioChannels, maxResolution, quality } = req.body;
```

- [ ] **Step 2: Use body values as overrides on lines 48-49**

In the same file, find (currently lines 48-49):
```js
maxResolution: settings.maxResolution || '1080p',
quality: settings.quality || 'medium',
```
Replace with:
```js
maxResolution: maxResolution || settings.maxResolution || '1080p',
quality: quality || settings.quality || 'medium',
```

- [ ] **Step 3: Verify server syntax is valid**

```bash
node --check server/routes/transcode.js
```
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add server/routes/transcode.js
git commit -m "feat: accept maxResolution/quality overrides in transcode session"
```

---

## Task 2: HTML — add quality picker markup

**Files:**
- Modify: `public/index.html` (after the `.watch-captions-wrapper` block, around line 925)

- [ ] **Step 1: Insert the quality wrapper after the closing `</div>` of the captions wrapper**

Find this exact closing tag in the VOD controls section (around line 925):
```html
                </div>
                <button class="watch-btn" id="watch-pip" title="Picture-in-Picture">
```
Insert the quality wrapper between them:
```html
                </div>
                <!-- Quality picker — same pattern as captions button -->
                <div class="watch-captions-wrapper" id="watch-quality-wrapper">
                  <button class="watch-btn" id="watch-quality-btn" title="Quality" style="display:none">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
                      <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
                    </svg>
                  </button>
                  <div class="watch-captions-menu hidden" id="watch-quality-menu">
                    <div class="captions-menu-title">Quality</div>
                    <div class="captions-menu-list" id="watch-quality-list"></div>
                  </div>
                </div>
                <button class="watch-btn" id="watch-pip" title="Picture-in-Picture">
```

- [ ] **Step 2: Open the app in a browser and confirm the quality button does not appear yet (it is `display:none`)**

Start the server:
```bash
node server/index.js
```
Open `http://localhost:3000`, navigate to a movie, and confirm no new button is visible in the control bar.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add quality picker markup to VOD player controls"
```

---

## Task 3: WatchPage — constructor refs, state, and event wiring

**Files:**
- Modify: `public/js/pages/WatchPage.js:64-98` (constructor) and `:100-242` (init)

- [ ] **Step 1: Add DOM element refs in the constructor after the captions block (after line 66)**

Find this block (around line 64-66):
```js
        // Captions
        this.captionsBtn = document.getElementById('watch-captions-btn');
        this.captionsMenu = document.getElementById('watch-captions-menu');
        this.captionsList = document.getElementById('watch-captions-list');
```
Add immediately after it:
```js
        // Quality picker
        this.qualityBtn = document.getElementById('watch-quality-btn');
        this.qualityMenu = document.getElementById('watch-quality-menu');
        this.qualityList = document.getElementById('watch-quality-list');
```

- [ ] **Step 2: Add quality state vars after `this.captionsMenuOpen = false` (around line 81)**

Find:
```js
        this.captionsMenuOpen = false;
```
Add after it:
```js
        this.qualityMenuOpen = false;
        this.qualityMode = null;      // 'hls' | 'transcode'
        this.currentQuality = null;   // -1 | level index (HLS) | 'auto' | '1080p' | '720p' | '480p' (transcode)
        this.lastTranscodeOptions = {};
```

- [ ] **Step 3: Wire up quality button and badge click handlers in init(), after the captions close listener (around line 231)**

Find this block (around line 226-231):
```js
        // Close captions menu when clicking outside
        document.addEventListener('click', (e) => {
            if (this.captionsMenuOpen && !this.captionsMenu?.contains(e.target) && e.target !== this.captionsBtn) {
                this.closeCaptionsMenu();
            }
        });
```
Add immediately after it:
```js
        // Quality button toggles picker
        this.qualityBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleQualityMenu();
        });

        // Quality badge also opens picker
        this.qualityBadgeEl?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleQualityMenu();
        });

        // Close quality menu when clicking outside
        document.addEventListener('click', (e) => {
            if (this.qualityMenuOpen &&
                !this.qualityMenu?.contains(e.target) &&
                e.target !== this.qualityBtn &&
                e.target !== this.qualityBadgeEl) {
                this.closeQualityMenu();
            }
        });
```

- [ ] **Step 4: Add toggleQualityMenu() and closeQualityMenu() methods**

Add these two methods anywhere in the class (a good place is right after `closeCaptionsMenu()`):
```js
    toggleQualityMenu() {
        if (this.qualityMenuOpen) {
            this.closeQualityMenu();
        } else {
            this.qualityMenu?.classList.remove('hidden');
            this.qualityMenuOpen = true;
        }
    }

    closeQualityMenu() {
        this.qualityMenu?.classList.add('hidden');
        this.qualityMenuOpen = false;
    }
```

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/WatchPage.js
git commit -m "feat: add quality picker state and event wiring to WatchPage"
```

---

## Task 4: WatchPage — populateQualityMenu, renderQualityMenu, and playHls hook

**Files:**
- Modify: `public/js/pages/WatchPage.js` — `playHls()` method and new quality menu methods

- [ ] **Step 1: Add populateQualityMenu() and renderQualityMenu() methods**

Add these two methods to the class (after `closeQualityMenu()` is a good place):
```js
    /**
     * Inspect hls.levels after manifest load and build the quality menu.
     * HLS mode: stream has multiple renditions — instant level switching.
     * Transcode mode: single rendition — restart session at chosen resolution.
     */
    populateQualityMenu() {
        const levels = this.hls?.levels || [];

        if (levels.length > 1) {
            this.qualityMode = 'hls';
            const items = [
                { label: 'Auto', value: -1 },
                ...levels.map((l, i) => ({
                    label: l.height ? `${l.height}p` : `Level ${i + 1}`,
                    value: i
                }))
            ];
            this.renderQualityMenu(items);
        } else {
            this.qualityMode = 'transcode';
            const items = [
                { label: 'Auto', value: 'auto' },
                { label: '1080p', value: '1080p' },
                { label: '720p', value: '720p' },
                { label: '480p', value: '480p' },
            ];
            this.renderQualityMenu(items);
        }
    }

    renderQualityMenu(items) {
        if (!this.qualityList) return;

        // Determine the currently active value (null → default for the mode)
        const defaultActive = this.qualityMode === 'hls' ? -1 : 'auto';
        const active = this.currentQuality ?? defaultActive;

        // Show or hide the quality button
        const hasChoice = items.length > 1;
        if (this.qualityBtn) this.qualityBtn.style.display = hasChoice ? '' : 'none';
        if (this.qualityBadgeEl) this.qualityBadgeEl.style.cursor = hasChoice ? 'pointer' : '';

        // Render menu items reusing the captions-option CSS class
        this.qualityList.innerHTML = items.map(item => `
            <button class="captions-option${item.value === active ? ' active' : ''}"
                    data-value="${item.value}">
                ${item.label}
            </button>
        `).join('');

        // Attach click handlers
        this.qualityList.querySelectorAll('.captions-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.dataset.value;
                // Convert to number for HLS level indices (-1, 0, 1, …); keep as string for presets
                const value = raw === '-1' ? -1
                    : (!isNaN(Number(raw)) && raw !== 'auto' && !raw.includes('p'))
                        ? Number(raw)
                        : raw;
                this.selectQuality(value);
            });
        });
    }
```

- [ ] **Step 2: Hook populateQualityMenu() into playHls() MANIFEST_PARSED handler**

Find the existing `MANIFEST_PARSED` handler in `playHls()` (around line 594):
```js
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            this.video.play().catch(e => {
                if (e.name !== 'AbortError') console.error('[WatchPage] Autoplay error:', e);
            });
        });
```
Replace with:
```js
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            this.video.play().catch(e => {
                if (e.name !== 'AbortError') console.error('[WatchPage] Autoplay error:', e);
            });
            this.populateQualityMenu();
        });
```

- [ ] **Step 3: Open the app, play a movie, and verify the quality button appears in the control bar**

- If the stream is a multi-rendition HLS → button shows "Auto" + height labels.
- If the stream is a single rendition (transcoded or direct HLS) → button shows "Auto / 1080p / 720p / 480p".
- Clicking the quality badge in the top corner should also open the menu.

- [ ] **Step 4: Commit**

```bash
git add public/js/pages/WatchPage.js
git commit -m "feat: implement quality menu population and rendering"
```

---

## Task 5: WatchPage — selectQuality(), lastTranscodeOptions tracking, and stop() cleanup

**Files:**
- Modify: `public/js/pages/WatchPage.js` — `selectQuality()`, `startTranscodeSession()`, `stop()`

- [ ] **Step 1: Add selectQuality() method**

Add this method after `renderQualityMenu()`:
```js
    async selectQuality(value) {
        this.closeQualityMenu();
        this.currentQuality = value;

        if (this.qualityMode === 'hls') {
            // Instant level switch — HLS.js handles buffering, no stream restart
            if (this.hls) this.hls.currentLevel = value; // -1 = adaptive auto
            this.populateQualityMenu(); // re-render to update active highlight
            return;
        }

        // Transcode mode — stop current session and restart at chosen resolution
        const seekTime = this.video?.currentTime || 0;
        await this.stopTranscodeSession();
        this.showLoading();

        const options = { ...this.lastTranscodeOptions, seekOffset: seekTime };
        if (value !== 'auto') {
            options.maxResolution = value;
        } else {
            delete options.maxResolution; // Server falls back to saved settings
        }

        const playlistUrl = await this.startTranscodeSession(this.streamUrl, options);
        this.playHls(playlistUrl);
        // MANIFEST_PARSED will fire → populateQualityMenu() re-runs → chosen item stays active
    }
```

- [ ] **Step 2: Update startTranscodeSession() to store lastTranscodeOptions**

Find the existing method (around line 331):
```js
    async startTranscodeSession(url, options = {}) {
        try {
            console.log('[WatchPage] Starting HLS transcode session...', options);
            const res = await fetch('/api/transcode/session', {
```
Replace the first two lines of the method body with:
```js
    async startTranscodeSession(url, options = {}) {
        // Persist options (minus seekOffset) so quality switches can reuse them
        const { seekOffset: _seek, ...persistentOptions } = options;
        this.lastTranscodeOptions = persistentOptions;

        try {
            console.log('[WatchPage] Starting HLS transcode session...', options);
            const res = await fetch('/api/transcode/session', {
```

- [ ] **Step 3: Update stop() to reset quality state**

Find the block in `stop()` that destroys the hls instance (around line 636):
```js
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
```
Add the quality reset immediately before it:
```js
        // Reset quality picker
        this.qualityMode = null;
        this.currentQuality = null;
        this.lastTranscodeOptions = {};
        if (this.qualityBtn) this.qualityBtn.style.display = 'none';
        this.closeQualityMenu();

        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
```

- [ ] **Step 4: Manual end-to-end test**

Start the server (`node server/index.js`) and test the following:

**HLS multi-rendition stream (if available):**
1. Play a movie. Quality button appears with "Auto" + resolution levels.
2. Select a lower resolution level. Playback continues without restart, active item updates.
3. Select "Auto". Adaptive streaming resumes.

**Single-rendition / transcoded stream:**
1. Play a movie. Quality button appears with "Auto / 1080p / 720p / 480p".
2. Select "720p". Loading spinner shows, stream restarts at 720p from the same position (within ~1s).
3. Quality menu re-opens showing "720p" as active.
4. Select "Auto". Stream restarts using settings default resolution.

**Quality badge:**
1. Tapping the "1080p" badge in the top corner opens the quality menu.

**Navigation:**
1. Go back from the player. Play a different movie. Quality button is hidden until the new manifest loads.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/WatchPage.js
git commit -m "feat: implement quality selection — HLS instant switch and transcode restart"
```

---

## Self-Review Notes

- **Spec coverage:** All three spec requirements addressed — HLS instant switch (Task 4-5), transcode preset restart with seekOffset (Task 5), server override (Task 1), two entry points: button + badge (Tasks 2-3). ✓
- **No placeholders.** All steps contain complete code. ✓
- **Type consistency:** `value` is `-1` (number) for HLS auto, `0/1/2…` (number) for HLS levels, `'auto'/'1080p'/'720p'/'480p'` (string) for transcode — the `data-value` conversion in `renderQualityMenu` and the `selectQuality` switch both handle this consistently. ✓
- **Scope note:** Quality picker only appears when `playHls()` is called. Direct MP4 playback (no HLS.js) does not show the picker. This matches the spec scope.
