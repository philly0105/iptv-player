# DVR / Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual live recording (start/stop while watching) and VOD download (pipe movie/episode to browser) to iptv-player.

**Architecture:** FFmpeg writes live streams to `.ts` files in `data/recordings/` via a new recording service. VOD downloads use FFmpeg to pipe the stream to the browser as a file download. A new `/recordings` page lists saved recordings with download and delete actions.

**Tech Stack:** Node.js, Express, FFmpeg (already present), better-sqlite3, vanilla JS (existing patterns)

---

## File Map

**New files:**
- `server/services/recordingService.js` — spawns/tracks FFmpeg recording processes
- `server/routes/recordings.js` — REST endpoints for recordings CRUD + download
- `public/js/pages/RecordingsPage.js` — recordings list UI

**Modified files:**
- `server/db/sqlite.js` — add `recordings` table + CRUD helpers
- `server/index.js` — register `/api/recordings` route
- `server/routes/proxy.js` — add `GET /vod` download endpoint
- `public/js/api.js` — add `recordings` namespace
- `public/index.html` — add recordings nav, page div, script tag, record button in live player, download button in watch actions
- `public/js/pages/WatchPage.js` — store streamUrl, wire download button
- `public/js/pages/LivePage.js` — record button state management
- `public/js/app.js` — register RecordingsPage

---

## Task 1: DB schema — recordings table

**Files:**
- Modify: `server/db/sqlite.js`

- [ ] **Step 1: Add recordings table to `initSchema()`**

In `server/db/sqlite.js`, after the `watch_history` migration block (after line 144), add:

```javascript
    // Recordings
    db.exec(`
        CREATE TABLE IF NOT EXISTS recordings (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            channel_name TEXT NOT NULL,
            filename TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'recording',
            started_at INTEGER NOT NULL,
            stopped_at INTEGER,
            file_size INTEGER,
            error_msg TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
        CREATE INDEX IF NOT EXISTS idx_recordings_started ON recordings(started_at DESC);
    `);
```

- [ ] **Step 2: Add recordings CRUD object**

After the `favorites` object (after line 210, before `module.exports`), add:

```javascript
const recordings = {
    insert(id, userId, channelName, filename) {
        const db = getDb();
        db.prepare(`
            INSERT INTO recordings (id, user_id, channel_name, filename, status, started_at)
            VALUES (?, ?, ?, ?, 'recording', ?)
        `).run(id, userId || null, channelName, filename, Date.now());
    },

    markDone(id, fileSize) {
        const db = getDb();
        db.prepare(`
            UPDATE recordings SET status = 'done', stopped_at = ?, file_size = ? WHERE id = ?
        `).run(Date.now(), fileSize || 0, id);
    },

    markError(id, errorMsg) {
        const db = getDb();
        db.prepare(`
            UPDATE recordings SET status = 'error', stopped_at = ?, error_msg = ? WHERE id = ?
        `).run(Date.now(), errorMsg || 'Unknown error', id);
    },

    markInterruptedAsError() {
        const db = getDb();
        db.prepare(`
            UPDATE recordings SET status = 'error', stopped_at = ?, error_msg = 'Server restarted'
            WHERE status = 'recording'
        `).run(Date.now());
    },

    getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM recordings ORDER BY started_at DESC').all();
    },

    getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM recordings WHERE id = ?').get(id);
    },

    delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
    }
};
```

- [ ] **Step 3: Export recordings**

Replace the existing `module.exports` at the bottom of `server/db/sqlite.js`:

```javascript
module.exports = {
    getDb,
    initSchema,
    favorites,
    recordings
};
```

- [ ] **Step 4: Verify server starts without error**

Run: `npm run dev`
Expected: `[SQLite] Schema initialized` in console, no errors.

- [ ] **Step 5: Commit**

```bash
git add server/db/sqlite.js
git commit -m "feat: add recordings table and CRUD helpers to SQLite schema"
```

---

## Task 2: Recording service

**Files:**
- Create: `server/services/recordingService.js`

- [ ] **Step 1: Create the service file**

Create `server/services/recordingService.js`:

```javascript
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { recordings } = require('../db/sqlite');

const recordingsDir = path.join(__dirname, '..', '..', 'data', 'recordings');

// Ensure recordings directory exists
if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
}

// In-memory map of active FFmpeg processes: id -> { process, filename }
const active = new Map();

function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

function startRecording(channelName, streamUrl, userId, ffmpegPath) {
    const id = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const filename = `${timestamp}-${sanitizeName(channelName)}.ts`;
    const outputPath = path.join(recordingsDir, filename);

    const args = [
        '-hide_banner', '-loglevel', 'warning',
        '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-fflags', '+genpts+discardcorrupt+nobuffer',
        '-err_detect', 'ignore_err',
        '-i', streamUrl,
        '-map', '0:v', '-map', '0:a',
        '-c', 'copy',
        '-f', 'mpegts',
        outputPath
    ];

    const ffmpeg = spawn(ffmpegPath || 'ffmpeg', args);

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('error') || msg.includes('Error')) {
            console.warn(`[Recording ${id}] FFmpeg: ${msg.trim()}`);
        }
    });

    ffmpeg.on('exit', (code) => {
        if (active.has(id)) {
            // Unexpected exit
            console.warn(`[Recording ${id}] FFmpeg exited with code ${code}`);
            active.delete(id);
            try {
                const stat = fs.statSync(outputPath);
                recordings.markDone(id, stat.size);
            } catch (_) {
                recordings.markError(id, `FFmpeg exited with code ${code}`);
            }
        }
    });

    ffmpeg.on('error', (err) => {
        console.error(`[Recording ${id}] Spawn error:`, err.message);
        active.delete(id);
        recordings.markError(id, err.message);
    });

    recordings.insert(id, userId, channelName, filename);
    active.set(id, { process: ffmpeg, filename, outputPath });

    console.log(`[Recording] Started: ${filename}`);
    return id;
}

function stopRecording(id) {
    const entry = active.get(id);
    if (!entry) return false;

    entry.process.kill('SIGTERM');
    setTimeout(() => {
        try { entry.process.kill('SIGKILL'); } catch (_) {}
    }, 3000);

    active.delete(id);

    try {
        const stat = fs.statSync(entry.outputPath);
        recordings.markDone(id, stat.size);
    } catch (_) {
        recordings.markDone(id, 0);
    }

    console.log(`[Recording] Stopped: ${entry.filename}`);
    return true;
}

function isActive(id) {
    return active.has(id);
}

function cleanupInterrupted() {
    recordings.markInterruptedAsError();
}

module.exports = { startRecording, stopRecording, isActive, cleanupInterrupted };
```

- [ ] **Step 2: Verify it loads**

Run: `npm run dev`
Expected: Server starts, no errors (the service directory is auto-loaded by `server/index.js`).

- [ ] **Step 3: Commit**

```bash
git add server/services/recordingService.js
git commit -m "feat: add recording service to manage FFmpeg recording processes"
```

---

## Task 3: Recordings route

**Files:**
- Create: `server/routes/recordings.js`

- [ ] **Step 1: Create the route file**

Create `server/routes/recordings.js`:

```javascript
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { recordings } = require('../db/sqlite');
const recordingService = require('../services/recordingService');
const { requireAuth } = require('../auth');

router.use(requireAuth);

const recordingsDir = path.join(__dirname, '..', '..', 'data', 'recordings');

// POST /api/recordings/start
router.post('/start', (req, res) => {
    const { channelName, streamUrl } = req.body;
    if (!channelName || !streamUrl) {
        return res.status(400).json({ error: 'channelName and streamUrl are required' });
    }

    const ffmpegPath = req.app.locals.ffmpegPath || 'ffmpeg';
    const userId = req.user?.id || null;

    try {
        const id = recordingService.startRecording(channelName, streamUrl, userId, ffmpegPath);
        res.json({ id });
    } catch (err) {
        console.error('[Recordings] Start error:', err);
        res.status(500).json({ error: 'Failed to start recording' });
    }
});

// POST /api/recordings/stop/:id
router.post('/stop/:id', (req, res) => {
    const { id } = req.params;
    const stopped = recordingService.stopRecording(id);
    if (!stopped) {
        return res.status(404).json({ error: 'Recording not found or already stopped' });
    }
    res.json({ success: true });
});

// GET /api/recordings
router.get('/', (req, res) => {
    try {
        const list = recordings.getAll().map(r => ({
            ...r,
            isActive: recordingService.isActive(r.id)
        }));
        res.json(list);
    } catch (err) {
        console.error('[Recordings] List error:', err);
        res.status(500).json({ error: 'Failed to list recordings' });
    }
});

// GET /api/recordings/:id/download
router.get('/:id/download', (req, res) => {
    const record = recordings.getById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Recording not found' });

    const filePath = path.join(recordingsDir, record.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
    res.setHeader('Content-Type', 'video/mp2t');
    fs.createReadStream(filePath).pipe(res);
});

// DELETE /api/recordings/:id
router.delete('/:id', (req, res) => {
    const record = recordings.getById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Recording not found' });

    // Stop if active
    if (recordingService.isActive(record.id)) {
        recordingService.stopRecording(record.id);
    }

    // Delete file
    const filePath = path.join(recordingsDir, record.filename);
    try { fs.unlinkSync(filePath); } catch (_) {}

    recordings.delete(record.id);
    res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/recordings.js
git commit -m "feat: add recordings REST route (start, stop, list, download, delete)"
```

---

## Task 4: Register routes + VOD download endpoint

**Files:**
- Modify: `server/index.js`
- Modify: `server/routes/proxy.js`

- [ ] **Step 1: Register recordings route and call cleanupInterrupted in `server/index.js`**

In `server/index.js`, after line `app.use('/api/history', require('./routes/history'));` (around line 182), add:

```javascript
app.use('/api/recordings', require('./routes/recordings'));
```

Also, after the FFmpeg detection section (after `app.locals.ffprobePath = findFFprobe();`, around line 89), add:

```javascript
// Mark any recordings that were in-progress when server last stopped as error
try {
    const { cleanupInterrupted } = require('./services/recordingService');
    cleanupInterrupted();
} catch (_) {}
```

- [ ] **Step 2: Add VOD download endpoint to `server/routes/proxy.js`**

Open `server/routes/proxy.js`. At the very end of the file, before `module.exports = router;`, add:

```javascript
/**
 * GET /api/proxy/vod?url=<encoded-url>&filename=<suggested-filename>
 * Pipes a VOD stream to the browser as a file download.
 * Uses FFmpeg to handle both direct MP4 and HLS sources.
 */
router.get('/vod', async (req, res) => {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: 'url parameter is required' });

    const safeFilename = (filename || 'download').replace(/[^a-zA-Z0-9_.\- ]/g, '_');
    const outputFilename = safeFilename.endsWith('.mp4') ? safeFilename : `${safeFilename}.mp4`;
    const ffmpegPath = req.app.locals.ffmpegPath || 'ffmpeg';

    const args = [
        '-hide_banner', '-loglevel', 'warning',
        '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-i', url,
        '-map', '0:v', '-map', '0:a',
        '-c', 'copy',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-'
    ];

    const { spawn } = require('child_process');
    let ffmpeg;
    try {
        ffmpeg = spawn(ffmpegPath, args);
    } catch (err) {
        return res.status(500).json({ error: 'FFmpeg spawn failed' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');

    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('error') || msg.includes('Error')) {
            console.warn('[VOD Download] FFmpeg:', msg.trim());
        }
    });

    req.on('close', () => ffmpeg.kill('SIGKILL'));

    ffmpeg.on('error', (err) => {
        console.error('[VOD Download] Spawn error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
});
```

- [ ] **Step 3: Verify endpoints are registered**

Run: `npm run dev`

In a new terminal run:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/recordings
```
Expected: `401` (auth required — confirms route is registered)

- [ ] **Step 4: Commit**

```bash
git add server/index.js server/routes/proxy.js
git commit -m "feat: register recordings route and add VOD download proxy endpoint"
```

---

## Task 5: API client — recordings methods

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: Add recordings namespace**

In `public/js/api.js`, before the final closing brace of the `API` object (before `};` on the last line before `window.API = API`), add a comma after the last property and then:

```javascript
    // Recordings
    recordings: {
        start: (channelName, streamUrl) =>
            API.request('POST', '/recordings/start', { channelName, streamUrl }),
        stop: (id) =>
            API.request('POST', `/recordings/stop/${id}`),
        list: () =>
            API.request('GET', '/recordings'),
        download: (id) => `/api/recordings/${id}/download`,
        delete: (id) =>
            API.request('DELETE', `/recordings/${id}`)
    }
```

Note: `download` returns a URL string (used with `window.location.href` to trigger browser download), not an API request.

- [ ] **Step 2: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add recordings API client methods"
```

---

## Task 6: HTML changes — nav, page, record button, download button, script tag

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add Recordings nav link**

In `public/index.html`, find the Settings nav link (around line 84):
```html
        <a href="#" class="nav-link" data-page="settings">
```

Insert the following BEFORE it:
```html
        <a href="#" class="nav-link" data-page="recordings">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
              class="icon">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg></span>
          <span>Recordings</span>
        </a>
```

- [ ] **Step 2: Add record button to the live player controls**

In `public/index.html`, find the player overflow wrapper in the live player controls (around line 247):
```html
                    <!-- Overflow Menu -->
                    <div class="player-overflow-wrapper">
```

Insert the following BEFORE that block:
```html
                    <button class="watch-btn" id="btn-record" title="Record">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                    </button>
```

- [ ] **Step 3: Add download button to watch-actions**

In `public/index.html`, find the `watch-actions` div (around line 976):
```html
              <div class="watch-actions">
                <button class="btn btn-primary" id="watch-play-btn">
```

After the favorite button block (after `</button>` for `watch-favorite-btn`), add:
```html
                <button class="btn btn-ghost" id="watch-download-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/>
                  </svg>
                  <span>Download</span>
                </button>
```

- [ ] **Step 4: Add recordings page div**

In `public/index.html`, find the Watch Page div (around line 817):
```html
      <!-- Watch Page (VOD Player) - Not in navigation -->
      <div id="page-watch" class="page watch-page">
```

Insert the following BEFORE it:
```html
      <!-- Recordings Page -->
      <div id="page-recordings" class="page">
        <div class="recordings-header" style="padding: var(--space-lg); border-bottom: 1px solid var(--color-border);">
          <h2>Recordings</h2>
        </div>
        <div id="recordings-list" style="padding: var(--space-lg);">
          <div class="empty-state">
            <p>No recordings yet</p>
            <p class="hint">Hit the record button while watching Live TV</p>
          </div>
        </div>
      </div>
```

- [ ] **Step 5: Add RecordingsPage script tag**

In `public/index.html`, find the WatchPage script tag (around line 1110):
```html
  <script src="/js/pages/WatchPage.js?v=1"></script>
```

Insert BEFORE it:
```html
  <script src="/js/pages/RecordingsPage.js?v=1"></script>
```

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: add recordings nav, page, record button, and download button to HTML"
```

---

## Task 7: RecordingsPage JS

**Files:**
- Create: `public/js/pages/RecordingsPage.js`

- [ ] **Step 1: Create the page controller**

Create `public/js/pages/RecordingsPage.js`:

```javascript
class RecordingsPage {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('recordings-list');
        this.recordings = [];
        this.timerInterval = null;
    }

    async show() {
        await this.load();
        this.startTimer();
    }

    hide() {
        this.stopTimer();
    }

    startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => this.updateActiveTimers(), 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async load() {
        try {
            this.recordings = await API.recordings.list();
            this.render();
        } catch (err) {
            this.container.innerHTML = `<p class="hint">Failed to load recordings: ${err.message}</p>`;
        }
    }

    render() {
        if (!this.recordings.length) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <p>No recordings yet</p>
                    <p class="hint">Hit the record button while watching Live TV</p>
                </div>`;
            return;
        }

        this.container.innerHTML = this.recordings.map(r => this.renderRow(r)).join('');

        this.container.querySelectorAll('[data-action="stop"]').forEach(btn => {
            btn.addEventListener('click', () => this.stopRecording(btn.dataset.id));
        });
        this.container.querySelectorAll('[data-action="download"]').forEach(btn => {
            btn.addEventListener('click', () => this.downloadRecording(btn.dataset.id));
        });
        this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => this.deleteRecording(btn.dataset.id));
        });
    }

    renderRow(r) {
        const date = new Date(r.started_at).toLocaleString();
        const size = r.file_size ? this.formatSize(r.file_size) : '—';
        const duration = r.stopped_at
            ? this.formatDuration(r.stopped_at - r.started_at)
            : r.isActive
                ? `<span class="recording-timer" data-started="${r.started_at}">${this.formatDuration(Date.now() - r.started_at)}</span>`
                : '—';

        const statusBadge = r.isActive
            ? '<span style="color:#ef4444;">● REC</span>'
            : r.status === 'done'
                ? '<span style="color:#22c55e;">Done</span>'
                : '<span style="color:#f59e0b;">Error</span>';

        const actions = r.isActive
            ? `<button class="btn btn-sm btn-ghost" data-action="stop" data-id="${r.id}">Stop</button>`
            : r.status === 'done'
                ? `<button class="btn btn-sm btn-ghost" data-action="download" data-id="${r.id}">Download</button>
                   <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${r.id}">Delete</button>`
                : `<button class="btn btn-sm btn-ghost" data-action="delete" data-id="${r.id}">Delete</button>`;

        return `
            <div class="recording-row" style="display:flex; align-items:center; gap:var(--space-md); padding:var(--space-md) 0; border-bottom:1px solid var(--color-border);">
                <div style="flex:1;">
                    <div style="font-weight:500;">${r.channel_name}</div>
                    <div class="hint">${date} · ${duration} · ${size}</div>
                </div>
                <div>${statusBadge}</div>
                <div style="display:flex; gap:var(--space-sm);">${actions}</div>
            </div>`;
    }

    updateActiveTimers() {
        this.container.querySelectorAll('.recording-timer').forEach(el => {
            const started = parseInt(el.dataset.started);
            el.textContent = this.formatDuration(Date.now() - started);
        });
    }

    async stopRecording(id) {
        try {
            await API.recordings.stop(id);
            await this.load();
        } catch (err) {
            alert('Failed to stop recording: ' + err.message);
        }
    }

    downloadRecording(id) {
        window.location.href = API.recordings.download(id);
    }

    async deleteRecording(id) {
        if (!confirm('Delete this recording?')) return;
        try {
            await API.recordings.delete(id);
            await this.load();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    }

    formatDuration(ms) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    formatSize(bytes) {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}

window.RecordingsPage = RecordingsPage;
```

- [ ] **Step 2: Commit**

```bash
git add public/js/pages/RecordingsPage.js
git commit -m "feat: add RecordingsPage controller with list, stop, download, delete"
```

---

## Task 8: Register RecordingsPage in app.js

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Instantiate RecordingsPage in App constructor**

In `public/js/app.js`, find the block of page instantiations (around line 18-24):
```javascript
        this.pages.home = new HomePage(this);
        this.pages.live = new LivePage(this);
        this.pages.guide = new GuidePage(this);
        this.pages.movies = new MoviesPage(this);
        this.pages.series = new SeriesPage(this);
        this.pages.settings = new SettingsPage(this);
        this.pages.watch = new WatchPage(this);
```

Add after `this.pages.settings = new SettingsPage(this);`:
```javascript
        this.pages.recordings = new RecordingsPage(this);
```

- [ ] **Step 2: Verify navigation works**

Run `npm run dev`, open http://localhost:3000, click Recordings in the nav.
Expected: Recordings page shows with "No recordings yet" empty state.

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: register RecordingsPage in app router"
```

---

## Task 9: Live player — record button logic

**Files:**
- Modify: `public/js/pages/LivePage.js`

- [ ] **Step 1: Replace LivePage class with recording-capable version**

Replace the entire contents of `public/js/pages/LivePage.js` with:

```javascript
class LivePage {
    constructor(app) {
        this.app = app;
        this.handleKeydown = this.handleKeydown.bind(this);
        this.activeRecordingId = null;
        this.recordTimerInterval = null;
        this.recordStartTime = null;
    }

    async init() {
        await this.app.channelList.loadSources();
        await this.app.channelList.loadChannels();

        try {
            await this.app.epgGuide.fetchEpgData();
            this.app.channelList.clearProgramInfoCache();
            this.updateProgramInfo();
        } catch (err) {
            console.warn('Background EPG fetch failed:', err);
        }

        this.initRecordButton();
    }

    initRecordButton() {
        const btn = document.getElementById('btn-record');
        if (!btn) return;
        btn.addEventListener('click', () => this.toggleRecording());
    }

    async toggleRecording() {
        if (this.activeRecordingId) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        const channel = this.app.player?.currentChannel;
        if (!channel) return;

        const streamUrl = channel.url || channel.stream_url;
        if (!streamUrl) return;

        try {
            const result = await API.recordings.start(channel.name, streamUrl);
            this.activeRecordingId = result.id;
            this.recordStartTime = Date.now();
            this.updateRecordButton();
            this.recordTimerInterval = setInterval(() => this.updateRecordButton(), 1000);
        } catch (err) {
            console.error('[Recording] Start failed:', err);
        }
    }

    async stopRecording() {
        if (!this.activeRecordingId) return;
        try {
            await API.recordings.stop(this.activeRecordingId);
        } catch (err) {
            console.error('[Recording] Stop failed:', err);
        }
        this.activeRecordingId = null;
        this.recordStartTime = null;
        clearInterval(this.recordTimerInterval);
        this.recordTimerInterval = null;
        this.updateRecordButton();
    }

    updateRecordButton() {
        const btn = document.getElementById('btn-record');
        if (!btn) return;

        if (this.activeRecordingId && this.recordStartTime) {
            const elapsed = Date.now() - this.recordStartTime;
            const s = Math.floor(elapsed / 1000);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            const timer = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            btn.title = `Stop Recording (${timer})`;
            btn.style.color = '#ef4444';
            btn.classList.add('recording-active');
        } else {
            btn.title = 'Record';
            btn.style.color = '';
            btn.classList.remove('recording-active');
        }
    }

    updateProgramInfo() {
        const channelItems = Array.from(document.querySelectorAll('.channel-item'));
        if (channelItems.length === 0) return;

        const channelMap = new Map();
        this.app.channelList.channels.forEach(c => channelMap.set(c.id, c));

        const BATCH_SIZE = 50;
        let index = 0;

        const processBatch = () => {
            const end = Math.min(index + BATCH_SIZE, channelItems.length);
            for (let i = index; i < end; i++) {
                const item = channelItems[i];
                const channelId = item.dataset.channelId;
                const channel = channelMap.get(channelId);
                if (channel) {
                    const programDiv = item.querySelector('.channel-program');
                    if (programDiv) {
                        programDiv.textContent = this.app.channelList.getProgramInfo(channel) || '';
                    }
                }
            }
            index = end;
            if (index < channelItems.length) requestAnimationFrame(processBatch);
        };

        requestAnimationFrame(processBatch);
    }

    handleKeydown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.key) {
            case 'ArrowUp':
                if (this.app.player && !this.app.player.settings.arrowKeysChangeChannel) return;
                e.preventDefault();
                this.app.channelList.selectPrevChannel();
                break;
            case 'ArrowDown':
                if (this.app.player && !this.app.player.settings.arrowKeysChangeChannel) return;
                e.preventDefault();
                this.app.channelList.selectNextChannel();
                break;
        }
    }

    async show() {
        document.addEventListener('keydown', this.handleKeydown);
        if (this.app.channelList.channels.length === 0) {
            await this.app.channelList.loadSources();
            await this.app.channelList.loadChannels();
        }
    }

    hide() {
        document.removeEventListener('keydown', this.handleKeydown);
    }
}

window.LivePage = LivePage;
```

- [ ] **Step 2: Verify record button works**

Run `npm run dev`, open http://localhost:3000, navigate to Live TV, select a channel, click the record button.
Expected: Button turns red. Check that a `.ts` file appears in `data/recordings/`. Click again to stop. File remains.

- [ ] **Step 3: Commit**

```bash
git add public/js/pages/LivePage.js
git commit -m "feat: add record/stop toggle to live player"
```

---

## Task 10: WatchPage — download button for movies and episodes

**Files:**
- Modify: `public/js/pages/WatchPage.js`

- [ ] **Step 1: Store streamUrl and wire download button in `init()`**

In `public/js/pages/WatchPage.js`, in the `init()` method (after line 241), add the following event listener alongside the existing ones (e.g., after `this.favoriteBtn?.addEventListener('click', () => this.toggleFavorite());`):

```javascript
        // Download button
        document.getElementById('watch-download-btn')?.addEventListener('click', () => this.downloadCurrent());
```

- [ ] **Step 2: Store streamUrl when `play()` is called**

In `public/js/pages/WatchPage.js`, in the `play(content, streamUrl)` method (around line 248), add after `this.containerExtension = content.containerExtension || 'mp4';`:

```javascript
        this.streamUrl = streamUrl;
```

- [ ] **Step 3: Add `downloadCurrent()` method**

In `public/js/pages/WatchPage.js`, find the `goBack()` method and add the following NEW method just before it:

```javascript
    downloadCurrent() {
        if (!this.streamUrl || !this.content) return;
        const name = this.content.title || 'download';
        const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
        const url = `/api/proxy/vod?url=${encodeURIComponent(this.streamUrl)}&filename=${encodeURIComponent(safeName)}`;
        window.location.href = url;
    }
```

- [ ] **Step 4: Verify download button works**

Run `npm run dev`, navigate to Movies, click a movie to open the watch page, scroll down to the action buttons, click Download.
Expected: Browser starts downloading a `.mp4` file.

- [ ] **Step 5: Commit**

```bash
git add public/js/pages/WatchPage.js
git commit -m "feat: add download button to watch page for movies and VOD content"
```

---

## Verification Checklist

- [ ] Server starts without errors: `npm run dev`
- [ ] Recordings nav link appears and navigates to recordings page
- [ ] Recordings page shows "No recordings yet" when empty
- [ ] Select a live channel → click record button → button turns red → `data/recordings/` has a growing `.ts` file
- [ ] Click record button again → recording stops → file size finalized
- [ ] Recordings page shows the saved recording with Download and Delete buttons
- [ ] Click Download on recordings page → `.ts` file downloads to browser
- [ ] Click Delete → recording removed from list and disk
- [ ] Restart server → any in-progress recordings show as `error` status
- [ ] Navigate to Movies → open a movie → click Download → `.mp4` download starts in browser
