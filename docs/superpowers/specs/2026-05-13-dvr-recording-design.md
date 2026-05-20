# DVR / Recording Feature Design

**Date:** 2026-05-13  
**Status:** Approved

## Context

The app has no way to save content. Users want to record live TV streams while watching and download VOD (movies/episodes) for offline use. FFmpeg is already integrated for transcoding, making live recording a natural extension. VOD downloads can reuse the existing proxy infrastructure to pipe streams directly to the browser without server-side storage.

## Scope

- Manual live recording (start/stop while watching)
- VOD download (movies and series episodes piped directly to browser)
- Recordings management page (list, download, delete saved live recordings)

Out of scope: scheduled/EPG-based recording, in-app playback of recordings.

---

## Architecture

### Live Recording

**Service:** `server/services/recordingService.js`  
Manages active FFmpeg processes. Pattern mirrors `server/services/transcodeSession.js`.

- `startRecording({ channelName, streamUrl, sourceId })` → spawns FFmpeg, returns recording id
- `stopRecording(id)` → SIGTERM → SIGKILL, finalizes file, updates DB
- In-memory Map of active processes; DB is source of truth for completed recordings
- FFmpeg command: `-c copy` (no re-encoding) → `data/recordings/<timestamp>-<channelName>.mp4`
- On server restart, marks any `recording` status rows as `error` (interrupted)

**Route:** `server/routes/recordings.js`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/recordings/start` | Start recording; body: `{ channelName, streamUrl, sourceId }` |
| POST | `/api/recordings/stop/:id` | Stop active recording |
| GET | `/api/recordings` | List all recordings |
| GET | `/api/recordings/:id/download` | Serve file as attachment |
| DELETE | `/api/recordings/:id` | Delete file + DB row |

**Database:** New `recordings` table in `server/db/sqlite.js`

```sql
CREATE TABLE recordings (
  id        TEXT PRIMARY KEY,
  channel_name TEXT NOT NULL,
  source_id INTEGER,
  filename  TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'recording', -- recording | done | error
  started_at INTEGER NOT NULL,
  stopped_at INTEGER,
  file_size  INTEGER,
  error_msg  TEXT
)
```

Storage path: `data/recordings/` (created on first use).

---

### VOD Download

**Route:** single new endpoint added to `server/routes/proxy.js` (or a dedicated file)

```
GET /api/download/vod?url=<encoded-stream-url>&filename=<suggested-name>
```

- Fetches the VOD URL server-side (handles CORS, auth headers same as existing proxy)
- Streams response to browser with `Content-Disposition: attachment; filename="<name>.mp4"`
- No server-side storage — pipes directly to browser
- Reuses the existing `fetch` + async iterator pattern already in `proxy.js`

---

## Frontend

### Live Player (`public/js/pages/LivePage.js`)

- Red record button added to video controls
- While recording: pulsing red dot + elapsed timer (`● 00:04:32`)
- Click to start → `POST /api/recordings/start` with current channel info
- Click again to stop → `POST /api/recordings/stop/:id`
- On stop: brief toast "Recording saved"

### Movies Page (`public/js/pages/MoviesPage.js`)

- Download icon on movie detail view
- Click → `GET /api/download/vod?url=<streamUrl>&filename=<movieTitle>`
- Triggers browser file download directly

### Series Page (`public/js/pages/SeriesPage.js`)

- Download icon on each episode row
- Same behavior as movie download

### Recordings Page (`public/js/pages/RecordingsPage.js`)

- New page accessible from nav
- Lists saved recordings: channel, date, duration, file size
- In-progress recordings at top with live timer + Stop button
- Each completed row: Download button + Delete button
- Registered in the SPA router (same pattern as existing pages)

### API Client (`public/js/api.js`)

New methods:
- `API.recordings.start(channelName, streamUrl, sourceId)`
- `API.recordings.stop(id)`
- `API.recordings.list()`
- `API.recordings.download(id)`
- `API.recordings.delete(id)`

---

## Files Modified

| File | Change |
|------|--------|
| `server/db/sqlite.js` | Add `recordings` table + migration |
| `server/index.js` | Register `/api/recordings` route |
| `server/routes/proxy.js` | Add `/api/download/vod` endpoint |
| `public/js/pages/LivePage.js` | Add record button + logic |
| `public/js/pages/MoviesPage.js` | Add download button |
| `public/js/pages/SeriesPage.js` | Add download button per episode |
| `public/js/api.js` | Add recordings API methods |

## Files Created

| File | Purpose |
|------|---------|
| `server/services/recordingService.js` | FFmpeg recording process manager |
| `server/routes/recordings.js` | Recordings CRUD + download endpoints |
| `public/js/pages/RecordingsPage.js` | Recordings list UI |

---

## Verification

1. Start server, navigate to Live TV
2. Select a channel, click record — confirm `data/recordings/` contains a growing `.mp4` file
3. Stop recording — confirm file is finalized and appears in Recordings page
4. Click Download on Recordings page — file downloads to browser
5. Navigate to Movies, click download on a movie — file downloads to browser
6. Navigate to Series, click download on an episode — file downloads to browser
7. Delete a recording — file removed from disk and list
8. Restart server mid-recording — recording shows as `error` status, not stuck as `recording`
