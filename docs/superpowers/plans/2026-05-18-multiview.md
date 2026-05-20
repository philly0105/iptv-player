# Multiview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Multiview page where users can watch up to 4 live TV channels simultaneously in a 2×2 grid or 1+3 focus layout, with click-to-focus audio and a channel picker.

**Architecture:** A new `StreamSlot` component owns each video element + HLS.js instance independently. A new `MultiviewPage` controller manages 4 slots, layout switching, audio focus, and a channel picker overlay. The existing `VideoPlayer`, `WatchPage`, and routing are untouched except for registering the new page in `app.js`. Desktop only; hidden on mobile via CSS.

**Tech Stack:** Vanilla JS (no framework), HLS.js 1.5.7, existing CSS variable system in `public/css/main.css`.

---

## File Map

| File | Change |
|---|---|
| `public/css/main.css` | Append multiview styles |
| `public/index.html` | Add nav entry, page section, picker overlay, context menu item, script tags |
| `public/js/components/StreamSlot.js` | New — self-contained slot (video + HLS + UI) |
| `public/js/pages/MultiviewPage.js` | New — page controller |
| `public/js/app.js` | Register `MultiviewPage` |
| `public/js/components/ChannelList.js` | Add multiview button per channel + context menu action |

---

## Task 1: CSS — multiview styles

**Files:**
- Modify: `public/css/main.css` (append at end of file)

- [ ] **Step 1: Append all multiview CSS to the end of `public/css/main.css`**

```css
/* ============================================================
   Multiview
   ============================================================ */

.multiview-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  gap: var(--space-md);
  background: var(--color-bg-primary);
}

.multiview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.multiview-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.multiview-layout-btns {
  display: flex;
  gap: var(--space-xs);
}

.multiview-layout-btn {
  background: var(--color-bg-secondary, #1e1e2e);
  border: 1px solid var(--color-border, rgba(255,255,255,0.1));
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  padding: 6px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.8125rem;
  transition: background 0.15s, color 0.15s;
}

.multiview-layout-btn.active {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}

.multiview-grid {
  flex: 1;
  display: grid;
  gap: 4px;
  min-height: 0;
}

.multiview-grid.layout-grid {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.multiview-grid.layout-focus {
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
}

.multiview-grid.layout-focus .stream-slot:first-child {
  grid-row: 1 / 4;
}

/* --- Stream Slot --- */

.stream-slot {
  position: relative;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s;
  min-height: 0;
}

.stream-slot.focused {
  border-color: var(--color-accent);
}

.stream-slot video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.slot-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: var(--color-bg-secondary, #1e1e2e);
  color: var(--color-text-secondary);
}

.slot-empty .slot-empty-icon {
  width: 36px;
  height: 36px;
  opacity: 0.4;
}

.slot-empty span {
  font-size: 0.8125rem;
  opacity: 0.6;
}

.slot-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.55);
}

.slot-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: var(--color-bg-secondary, #1e1e2e);
  color: var(--color-text-secondary);
  padding: var(--space-md);
  text-align: center;
}

.slot-error-msg {
  font-size: 0.8125rem;
  line-height: 1.4;
}

.slot-retry-btn {
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 4px 12px;
  cursor: pointer;
  font-size: 0.8125rem;
}

.slot-label {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background: rgba(0,0,0,0.72);
  color: #fff;
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 36px);
}

.slot-focus-indicator {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--color-accent);
  color: #fff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.slot-focus-indicator svg {
  width: 14px;
  height: 14px;
}

.slot-change-btn {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0,0,0,0.65);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  font-size: 0.75rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  z-index: 2;
}

.stream-slot:hover .slot-change-btn {
  opacity: 1;
  pointer-events: auto;
}

/* --- Picker Overlay --- */

.multiview-picker {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.multiview-picker-panel {
  background: var(--color-bg-secondary, #1e1e2e);
  border-radius: var(--radius-lg);
  width: 360px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.multiview-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.multiview-picker-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.multiview-picker-close {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 1.375rem;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.multiview-picker-search {
  margin: var(--space-sm) var(--space-md);
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-bg-primary, #13131f);
  border: 1px solid var(--color-border, rgba(255,255,255,0.08));
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  flex-shrink: 0;
  outline: none;
}

.multiview-picker-list {
  overflow-y: auto;
  flex: 1;
  padding: var(--space-xs) var(--space-sm) var(--space-sm);
}

.picker-channel-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-primary);
  transition: background 0.1s;
}

.picker-channel-item:hover {
  background: rgba(255,255,255,0.06);
}

.picker-channel-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
}

.picker-channel-name {
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- "Add to Multiview" button in channel list --- */

.multiview-add-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.channel-item:hover .multiview-add-btn {
  opacity: 1;
}

.multiview-add-btn:hover {
  color: var(--color-accent);
}

.multiview-add-btn svg {
  width: 16px;
  height: 16px;
}

/* Hide multiview nav + page entirely on mobile */
@media (max-width: 768px) {
  .nav-link[data-page="multiview"],
  #page-multiview {
    display: none !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: add multiview CSS styles"
```

---

## Task 2: HTML — nav entry, page section, picker overlay, context menu item, script tags

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add multiview nav link after the Recordings nav link**

Find (around line 58–61):
```html
        <a href="#" class="nav-link" data-page="recordings">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg></span>
          <span class="nav-link-label">Recordings</span>
        </a>
      </nav>
```
Replace with:
```html
        <a href="#" class="nav-link" data-page="recordings">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg></span>
          <span class="nav-link-label">Recordings</span>
        </a>
        <a href="#" class="nav-link" data-page="multiview">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg></span>
          <span class="nav-link-label">Multiview</span>
        </a>
      </nav>
```

- [ ] **Step 2: Add multiview page section before `<!-- Context Menu Template -->`**

Find (around line 1067):
```html
  <!-- Context Menu Template -->
```
Insert immediately before it:
```html
  <!-- Multiview Page -->
  <section id="page-multiview" class="page">
    <div class="multiview-container">
      <div class="multiview-header">
        <h2 class="multiview-title">Multiview</h2>
        <div class="multiview-layout-btns">
          <button class="multiview-layout-btn active" data-layout="grid" title="2×2 Grid">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px">
              <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
            </svg>
            2×2
          </button>
          <button class="multiview-layout-btn" data-layout="focus" title="1+3 Focus">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px">
              <path d="M3 3h13v13H3V3zm0 14h5v4H3v-4zm7 0h5v4h-5v-4zm7-14h4v5h-4V3zm0 7h4v5h-4v-5z"/>
            </svg>
            1+3
          </button>
        </div>
      </div>
      <div class="multiview-grid layout-grid" id="multiview-grid"></div>
    </div>
    <!-- Channel Picker Overlay -->
    <div class="multiview-picker hidden" id="multiview-picker">
      <div class="multiview-picker-panel">
        <div class="multiview-picker-header">
          <h3>Select Channel</h3>
          <button class="multiview-picker-close" id="multiview-picker-close">&times;</button>
        </div>
        <input type="text" class="multiview-picker-search" id="multiview-picker-search" placeholder="Search channels…">
        <div class="multiview-picker-list" id="multiview-picker-list"></div>
      </div>
    </div>
  </section>

```

- [ ] **Step 3: Add "Open in Multiview" to the context menu**

Find (around line 1073):
```html
    <button class="context-item" data-action="hide">
```
Insert immediately before it:
```html
    <button class="context-item context-multiview" data-action="multiview"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg> Open in Multiview</button>
```

- [ ] **Step 4: Add StreamSlot and MultiviewPage script tags before app.js**

Find (around line 1145):
```html
  <script src="/js/pages/WatchPage.js?v=1"></script>
  <script src="/js/app.js?v=4"></script>
```
Replace with:
```html
  <script src="/js/pages/WatchPage.js?v=1"></script>
  <script src="/js/components/StreamSlot.js"></script>
  <script src="/js/pages/MultiviewPage.js"></script>
  <script src="/js/app.js?v=4"></script>
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: add multiview HTML structure, nav entry, and script tags"
```

---

## Task 3: StreamSlot component

**Files:**
- Create: `public/js/components/StreamSlot.js`

- [ ] **Step 1: Create `public/js/components/StreamSlot.js` with the full implementation**

```js
/**
 * StreamSlot — self-contained video slot for multiview.
 * Owns one <video> element and one HLS.js instance.
 * Does NOT use the singleton VideoPlayer.
 */
class StreamSlot {
    constructor(index) {
        this.index = index;
        this.channel = null;
        this.hls = null;
        this._focused = false;

        this.el = document.createElement('div');
        this.el.className = 'stream-slot';
        this.el.dataset.slot = index;

        this.el.innerHTML = `
            <video playsinline muted></video>
            <div class="slot-loading hidden"><div class="loading-spinner"></div></div>
            <div class="slot-empty">
                <svg class="slot-empty-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
                </svg>
                <span>Add channel</span>
            </div>
            <div class="slot-error hidden">
                <span class="slot-error-msg"></span>
                <button class="slot-retry-btn">Retry</button>
            </div>
            <div class="slot-label hidden"></div>
            <div class="slot-focus-indicator hidden">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
            </div>
            <button class="slot-change-btn" title="Change channel">Change</button>
        `;

        this.video = this.el.querySelector('video');
        this.loadingEl = this.el.querySelector('.slot-loading');
        this.emptyEl = this.el.querySelector('.slot-empty');
        this.errorEl = this.el.querySelector('.slot-error');
        this.errorMsg = this.el.querySelector('.slot-error-msg');
        this.labelEl = this.el.querySelector('.slot-label');
        this.focusIndicator = this.el.querySelector('.slot-focus-indicator');
        this.changeBtn = this.el.querySelector('.slot-change-btn');

        this.el.querySelector('.slot-retry-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.channel) this.load(this.channel);
        });
    }

    /**
     * Load a channel into this slot.
     * Resolves stream URL internally (xtream vs m3u).
     */
    async load(channel) {
        this.channel = channel;
        this._showLoading();

        try {
            let streamUrl;
            if (channel.sourceType === 'xtream') {
                const streamFormat = window.app?.player?.settings?.streamFormat || 'm3u8';
                const result = await API.proxy.xtream.getStreamUrl(
                    channel.sourceId, channel.streamId, 'live', streamFormat
                );
                streamUrl = result.url;
            } else {
                streamUrl = channel.url;
            }

            // Guard: transcoding not supported in multiview
            if (streamUrl && streamUrl.includes('/api/transcode')) {
                this._showError('Transcoding not supported in multiview');
                return;
            }

            this._playStream(streamUrl, channel.name);
        } catch (err) {
            console.error(`[StreamSlot ${this.index}] Failed to load channel:`, err);
            this._showError('Failed to load channel');
        }
    }

    _playStream(url, label) {
        // Destroy any existing HLS instance
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.video.src = '';

        const isHls = url.includes('.m3u8') || url.includes('m3u8');

        if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
            this.hls = new Hls({ maxBufferLength: 20, maxMaxBufferLength: 40, startLevel: -1, enableWorker: true });
            this.hls.loadSource(url);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this._hideLoading();
                this._showLabel(label);
                this.video.play().catch(() => {});
            });

            this.hls.on(Hls.Events.ERROR, (e, data) => {
                if (data.fatal) {
                    this._showError('Stream error — tap to retry');
                }
            });
        } else {
            // Native playback (e.g. native HLS on Safari, or non-HLS)
            this.video.src = url;
            this.video.addEventListener('canplay', () => {
                this._hideLoading();
                this._showLabel(label);
            }, { once: true });
            this.video.addEventListener('error', () => {
                this._showError('Stream error — tap to retry');
            }, { once: true });
            this.video.play().catch(() => {});
        }
    }

    unload() {
        if (this.hls) { this.hls.destroy(); this.hls = null; }
        this.video.pause();
        this.video.src = '';
        this.channel = null;
        this._showEmpty();
    }

    focus() {
        this._focused = true;
        this.video.muted = false;
        this.el.classList.add('focused');
        this.focusIndicator.classList.remove('hidden');
    }

    unfocus() {
        this._focused = false;
        this.video.muted = true;
        this.el.classList.remove('focused');
        this.focusIndicator.classList.add('hidden');
    }

    isEmpty() { return this.channel === null; }
    getChannel() { return this.channel; }

    // --- private UI helpers ---

    _showLoading() {
        this.emptyEl.classList.add('hidden');
        this.errorEl.classList.add('hidden');
        this.loadingEl.classList.remove('hidden');
    }

    _hideLoading() {
        this.loadingEl.classList.add('hidden');
    }

    _showEmpty() {
        this.loadingEl.classList.add('hidden');
        this.errorEl.classList.add('hidden');
        this.labelEl.classList.add('hidden');
        this.emptyEl.classList.remove('hidden');
    }

    _showError(msg) {
        this.loadingEl.classList.add('hidden');
        this.emptyEl.classList.add('hidden');
        this.errorMsg.textContent = msg;
        this.errorEl.classList.remove('hidden');
    }

    _showLabel(text) {
        this.labelEl.textContent = text;
        this.labelEl.classList.remove('hidden');
    }
}
```

- [ ] **Step 2: Verify the file was created**

```bash
node --check "public/js/components/StreamSlot.js"
```
Expected: no output (no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add public/js/components/StreamSlot.js
git commit -m "feat: add StreamSlot component for multiview"
```

---

## Task 4: MultiviewPage controller

**Files:**
- Create: `public/js/pages/MultiviewPage.js`

- [ ] **Step 1: Create `public/js/pages/MultiviewPage.js`**

```js
/**
 * MultiviewPage — watch up to 4 live TV channels simultaneously.
 * Manages 4 StreamSlot instances, layout switching, audio focus,
 * and a channel picker overlay.
 */
class MultiviewPage {
    constructor(app) {
        this.app = app;
        this.slots = [];
        this.focusedSlot = 0;
        this.layout = 'grid';
        this.pickerSlot = null;
        this.pendingChannel = null;
        this._allChannels = []; // Cache for picker

        this.grid = document.getElementById('multiview-grid');
        this.pickerEl = document.getElementById('multiview-picker');
        this.pickerSearch = document.getElementById('multiview-picker-search');
        this.pickerList = document.getElementById('multiview-picker-list');
        this.pickerClose = document.getElementById('multiview-picker-close');

        this._initSlots();
        this._initLayoutBtns();
        this._initPickerEvents();
    }

    _initSlots() {
        for (let i = 0; i < 4; i++) {
            const slot = new StreamSlot(i);
            this.slots.push(slot);
            this.grid.appendChild(slot.el);

            // Click on slot body → focus audio
            slot.el.addEventListener('click', (e) => {
                // If clicking the change button, open picker instead
                if (e.target.closest('.slot-change-btn')) {
                    e.stopPropagation();
                    this.openPicker(i);
                    return;
                }
                // If slot is empty, open picker
                if (slot.isEmpty()) {
                    this.openPicker(i);
                    return;
                }
                this.focusSlot(i);
            });

            // Mute all slots initially
            slot.video.muted = true;
        }
        // Give slot 0 audio focus on init
        this.slots[0].focus();
    }

    _initLayoutBtns() {
        const btns = document.querySelectorAll('.multiview-layout-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setLayout(btn.dataset.layout);
            });
        });
    }

    _initPickerEvents() {
        // Close button
        this.pickerClose?.addEventListener('click', () => this.closePicker());

        // Click outside panel closes picker
        this.pickerEl?.addEventListener('click', (e) => {
            if (e.target === this.pickerEl) this.closePicker();
        });

        // Escape key closes picker
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.pickerEl?.classList.contains('hidden')) {
                this.closePicker();
            }
        });

        // Search filter
        this.pickerSearch?.addEventListener('input', () => {
            this._renderPickerList(this.pickerSearch.value.trim());
        });
    }

    // Called by router when navigating to this page
    show() {
        if (this.pendingChannel) {
            const targetSlot = this.slots.findIndex(s => s.isEmpty());
            const index = targetSlot === -1 ? 0 : targetSlot;
            this.slots[index].load(this.pendingChannel);
            this.pendingChannel = null;
        }
        this.focusSlot(this.focusedSlot);
    }

    // Called by router when navigating away
    hide() {
        this.slots.forEach(s => s.unload());
        this.closePicker();
    }

    /**
     * Queue a channel to be loaded on next page show.
     * Called from ChannelList before navigating here.
     */
    queueChannel(channel) {
        this.pendingChannel = channel;
    }

    focusSlot(index) {
        this.slots[this.focusedSlot].unfocus();
        this.focusedSlot = index;
        this.slots[index].focus();
    }

    setLayout(layout) {
        this.layout = layout;
        this.grid.classList.remove('layout-grid', 'layout-focus');
        this.grid.classList.add(`layout-${layout}`);
    }

    openPicker(slotIndex) {
        this.pickerSlot = slotIndex;
        this.pickerSearch.value = '';
        this._loadPickerChannels().then(() => {
            this._renderPickerList('');
        });
        this.pickerEl.classList.remove('hidden');
        this.pickerSearch.focus();
    }

    closePicker() {
        this.pickerEl?.classList.add('hidden');
        this.pickerSlot = null;
    }

    async _loadPickerChannels() {
        // Use already-loaded channels from ChannelList if available
        const loaded = this.app.channelList?.channels;
        if (loaded && loaded.length > 0) {
            this._allChannels = loaded;
            return;
        }
        // Fallback: fetch from API
        try {
            const sources = await API.sources.getAll();
            const channels = [];
            for (const source of sources) {
                if (!source.enabled) continue;
                if (source.type === 'xtream') {
                    const streams = await API.proxy.xtream.liveStreams(source.id);
                    streams.forEach(s => channels.push({
                        id: `xtream_${source.id}_${s.stream_id}`,
                        streamId: s.stream_id,
                        name: s.name,
                        tvgLogo: s.stream_icon,
                        sourceId: source.id,
                        sourceType: 'xtream',
                    }));
                } else if (source.type === 'm3u') {
                    const data = await API.proxy.m3u.get(source.id);
                    (data.channels || []).forEach(c => channels.push({
                        id: `m3u_${source.id}_${c.id}`,
                        streamId: c.id,
                        name: c.name,
                        tvgLogo: c.tvgLogo,
                        sourceId: source.id,
                        sourceType: 'm3u',
                        url: c.url,
                    }));
                }
            }
            this._allChannels = channels;
        } catch (err) {
            console.error('[MultiviewPage] Failed to load channels for picker:', err);
            this._allChannels = [];
        }
    }

    _renderPickerList(query) {
        const q = query.toLowerCase();
        const filtered = q
            ? this._allChannels.filter(c => c.name.toLowerCase().includes(q))
            : this._allChannels;

        if (filtered.length === 0) {
            this.pickerList.innerHTML = '<p style="padding:12px;color:var(--color-text-secondary);font-size:0.875rem;text-align:center">No channels found</p>';
            return;
        }

        this.pickerList.innerHTML = filtered.slice(0, 200).map(ch => `
            <div class="picker-channel-item" data-channel-id="${ch.id}">
                <img class="picker-channel-logo"
                     src="${ch.tvgLogo ? '/api/proxy/image?url=' + encodeURIComponent(ch.tvgLogo) : '/img/placeholder.png'}"
                     alt="" onerror="this.src='/img/placeholder.png'">
                <span class="picker-channel-name">${this._escapeHtml(ch.name)}</span>
            </div>
        `).join('');

        this.pickerList.querySelectorAll('.picker-channel-item').forEach(item => {
            item.addEventListener('click', () => {
                const channel = this._allChannels.find(c => c.id === item.dataset.channelId);
                if (channel && this.pickerSlot !== null) {
                    this.slots[this.pickerSlot].load(channel);
                    this.closePicker();
                }
            });
        });
    }

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check "public/js/pages/MultiviewPage.js"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/MultiviewPage.js
git commit -m "feat: add MultiviewPage controller"
```

---

## Task 5: Register MultiviewPage in app.js

**Files:**
- Modify: `public/js/app.js:24-25`

- [ ] **Step 1: Register the multiview page in the App constructor**

Find (around line 24-25):
```js
        this.pages.recordings = new RecordingsPage(this);
        this.pages.watch = new WatchPage(this);
```
Replace with:
```js
        this.pages.recordings = new RecordingsPage(this);
        this.pages.watch = new WatchPage(this);
        this.pages.multiview = new MultiviewPage(this);
```

- [ ] **Step 2: Verify syntax**

```bash
node --check "public/js/app.js"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: register MultiviewPage in app router"
```

---

## Task 6: ChannelList integration — multiview button and context menu action

**Files:**
- Modify: `public/js/components/ChannelList.js`

- [ ] **Step 1: Add the multiview button to the channel item HTML template**

In `ChannelList.js`, find the channel item HTML template (around line 518). The template ends with the favorite button:
```js
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" title="${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}">
              ${isFavorite ? Icons.favorite : Icons.favoriteOutline}
            </button>
          </div>
```
Replace with:
```js
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" title="${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}">
              ${isFavorite ? Icons.favorite : Icons.favoriteOutline}
            </button>
            <button class="multiview-add-btn" title="Open in Multiview">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
              </svg>
            </button>
          </div>
```

- [ ] **Step 2: Wire up the multiview button click handler in `attachGroupListeners`**

In `attachGroupListeners` (around line 568-582), find:
```js
            const favBtn = item.querySelector('.favorite-btn');
            if (favBtn) {
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFavorite(parseInt(item.dataset.sourceId), item.dataset.channelId);
                });
            }
```
Add immediately after this block:
```js
            const multiviewBtn = item.querySelector('.multiview-add-btn');
            if (multiviewBtn) {
                multiviewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._openInMultiview(item.dataset.channelId);
                });
            }
```

- [ ] **Step 3: Add the `_openInMultiview` helper method to ChannelList**

Find any method near the bottom of the class (e.g. `escapeHtml` or similar utility method) and add this method before it:
```js
    /**
     * Navigate to the multiview page and load a channel into the first empty slot.
     */
    _openInMultiview(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        if (!channel || !window.app?.pages?.multiview) return;
        window.app.pages.multiview.queueChannel(channel);
        window.app.navigateTo('multiview');
    }
```

- [ ] **Step 4: Handle the 'multiview' context menu action in `handleContextAction`**

Find the switch statement in `handleContextAction` (around line 1204):
```js
            case 'epg':
                // Show EPG info modal
                this.showEpgInfo(sourceId, itemId, streamId);
                break;
        }
```
Add a new case before the closing brace:
```js
            case 'epg':
                // Show EPG info modal
                this.showEpgInfo(sourceId, itemId, streamId);
                break;
            case 'multiview':
                this._openInMultiview(itemId);
                break;
        }
```

- [ ] **Step 5: Verify syntax**

```bash
node --check "public/js/components/ChannelList.js"
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add public/js/components/ChannelList.js
git commit -m "feat: add Open in Multiview button and context menu action to channel list"
```

---

## Self-Review Notes

- **Spec coverage:**
  - ✅ Desktop only — hidden on mobile via CSS media query
  - ✅ Live TV only — StreamSlot accepts channel objects, MultiviewPage picker fetches only live channels
  - ✅ 2×2 grid layout (`layout-grid`)
  - ✅ 1+3 focus layout (`layout-focus`)
  - ✅ Click to focus audio — `focusSlot(i)` unmutes one, mutes others
  - ✅ Empty slot click opens picker
  - ✅ "Change" button on loaded slot opens picker
  - ✅ "Add to Multiview" button on channel list
  - ✅ "Open in Multiview" in context menu
  - ✅ First empty slot used on queue; slot 0 if all full
  - ✅ Transcoding guard — error shown if URL contains `/api/transcode`
  - ✅ HLS error → error state with retry
  - ✅ All slots unloaded on page leave
  - ✅ No persistence between visits

- **No placeholders** — all steps contain complete code.

- **Type consistency** — `slot.load(channel)`, `slot.unload()`, `slot.focus()`, `slot.unfocus()`, `slot.isEmpty()`, `slot.getChannel()` defined in Task 3 and used consistently in Task 4. `queueChannel(channel)` defined in Task 4 and called in Task 6.
