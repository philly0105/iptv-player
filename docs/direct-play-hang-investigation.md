# Investigation: "Direct Play takes forever to start" (movies)

**Status:** Resolved. Architectural gap addressed by implementing a browser-side stall detection timeout and automatic fallback to HLS remux/copy session.
**Started:** 2026-06-24
**Resolved:** 2026-06-25

## Bug report

User screenshot: watching "The Dark Knight Rises (2012)" via the Watch page, badge shows
"Direct Play" + "1080p", player stuck at `0:00` with the loading spinner spinning.

**User-confirmed facts (via direct Q&A — trust these over anything below):**
- It's a **true hang** — never plays, user gives up and backs out. Not just slow.
- Happens on **some movies**, not all, and not only this one title.

## Environment / how to reproduce

- Project: `C:\Users\aideo\Projects\IPTV-viewer-and-downloader-main` (port 3000 via `npm start`)
- Source involved in testing: source id `5` ("IPTV Service (cwdn)", Xtream-type)
- Test movie used so far: "The Dark Knight Rises", `itemId=1257368`, source 5
- Auth: app auto-issues a token at `GET /api/auth/localtoken` when accessed from localhost
  with no token — fetch it directly, seed it into `localStorage.authToken` before navigating
  (the app's own browser-side auto-login fetch of this same endpoint mysteriously fails
  inside headless Playwright Chromium specifically — unrelated rabbit hole, just route around
  it by pre-seeding the token instead of relying on `checkAuth()`'s silent auto-fetch).

**Gotcha found the hard way:** `public/index.html` has TWO `<video>` elements —
`#video-player` (Live TV, appears first in DOM) and `#watch-video` (VOD/movies, the one
that actually matters here). `document.querySelector('video')` silently grabs the wrong
one and will show `readyState=0`/`networkState=3` forever — that is a test-script bug,
not the app's bug. Always target `#watch-video` explicitly.

### Working repro script (Python + Playwright)

```python
import urllib.request, json, time
from playwright.sync_api import sync_playwright

token = json.loads(urllib.request.urlopen('http://localhost:3000/api/auth/localtoken').read())['token']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    context.add_init_script(f"window.localStorage.setItem('authToken', '{token}');")
    page = context.new_page()
    console_logs = []
    page.on("console", lambda msg: console_logs.append((round(time.time(),2), msg.type, msg.text)))

    net_events = []
    page.on("request", lambda req: net_events.append(("REQ", round(time.time(),2), req.method, req.url)))
    page.on("response", lambda res: net_events.append(("RES", round(time.time(),2), res.status, res.url, res.headers.get('content-range',''))))
    page.on("requestfailed", lambda req: net_events.append(("FAILED", round(time.time(),2), req.url, req.failure)))

    page.goto("http://localhost:3000/")
    page.wait_for_load_state("networkidle")
    page.locator('.nav-link[data-page="movies"]').click()
    page.wait_for_timeout(1500)
    search = page.locator('#page-movies .search-input')
    search.fill("MOVIE TITLE HERE")          # <-- change per repro
    page.wait_for_timeout(800)
    cards = page.locator('#page-movies .movie-card, #page-movies .vod-card, #page-movies [class*="card"]')
    cards.first.click()                      # clicking the card auto-navigates + auto-plays

    for i in range(30):                      # poll #watch-video, NOT first <video>
        page.wait_for_timeout(1000)
        st = page.evaluate("""
            () => {
                const v = document.getElementById('watch-video');
                if (!v) return {missing: true};
                return {currentTime: v.currentTime, readyState: v.readyState,
                        networkState: v.networkState, paused: v.paused,
                        error: v.error ? v.error.code : null, currentSrc: v.currentSrc};
            }
        """)
        print(f"t+{i+1}s {st}")

    browser.close()

print("\n--- CONSOLE ---")
for l in console_logs: print(l)
print("\n--- NETWORK (filter out tmdb image noise) ---")
for e in net_events:
    if 'image.tmdb' not in e[-1] if isinstance(e[-1], str) else True:
        print(e)
```

**Important:** redirect output to a file directly (`python script.py > out.txt 2>&1`), do NOT
pipe through `| tail -N` in the same Bash call — the network/console sections are large and
a `tail` on the *python* output (not the saved-output mechanism) will silently truncate the
early lines (this cost real time during this session).

## What was found so far

Network trace of a "successful" run (this exact movie, this run did NOT hang):

1. `GET http://83601-flip.cdn-o2.me/movie/.../1257368.mp4` (`Range: bytes=0-`) → **302 redirect**
   to a per-session tokenized URL on a *different* domain
   (`http://<hash>.h07.s02.nvme.90212.dvodcdn.xyz/live/play/<token>/1257368`)
2. That URL responds **206**, `Content-Range: bytes 0-2662526943/2662526944` — i.e. the
   "range" is the *entire* 2.66GB file. This is a non-fast-start MP4: the `moov` atom
   (metadata: duration, seek table) is at the **end** of the file, not the front.
3. Browser can't get duration from the front, so it makes a **second** request for the last
   ~28KB of the file (`Range: bytes=2662498304-`) to fetch the trailing `moov` atom.
4. Only after that round-trip does it know where to seek for the resume position, and issues
   a **third** request near the actual playback position.
5. `WatchPage.onMetadataLoaded()` (public/js/pages/WatchPage.js:866) fires, logs
   `Resuming at Ns`, sets `video.currentTime`, and playback starts.

In this successful run, steps 1-5 took **~3-4 seconds total** (datacenter-to-CDN latency) and
then played smoothly (`readyState` climbed to 4, `currentTime` advanced steadily, `duration`
correctly read as ~9873s ≈ 164 min, matching the movie's real runtime).

**This does NOT reproduce a true hang.** It only demonstrates that Direct Play requires 2-3
sequential round-trips to a third-party CDN before any frame renders — which would explain
*slowness* proportional to that CDN's latency, but not an infinite hang. Codec support was
separately confirmed fine in this same headless Chromium (tested `canPlayType` + a real public
H.264 MP4 — both fine), so it's not a headless-Chromium/codec-support artifact in general.

## What's NOT yet confirmed (the actual gap)

Given the user says it's a **true hang on some (not all) movies**, the leading unconfirmed
hypotheses, in rough order of plausibility, are:

1. **Flaky/overloaded CDN mirror node for specific titles.** The redirect target domain
   pattern (`<hash>.h07.s02.nvme.90212.dvodcdn.xyz`) looks like a sharded backend pool typical
   of IPTV reseller CDNs — some shards could be down/slow for specific content while others
   work fine. Would explain "some movies" + "never resolves" (the stalled request just never
   completes, no error ever fires because nothing times out client-side).
2. **Range-request non-compliance for specific files** — if a given file's host ignores the
   `Range` header and tries to send the whole multi-GB file from byte 0, the trailing-moov-atom
   discovery step could effectively never complete in practical time.
3. **Mixed content** — if the app is ever accessed over HTTPS (e.g. via a reverse proxy /
   Tailscale on another device) while the movie URL is plain `http://`, the browser silently
   blocks the request with no console error and no event ever fires — indistinguishable from
   an infinite spinner. Worth asking the user how they access the app (localhost vs.
   another device) if this resurfaces.

**Architecturally confirmed (not a hypothesis): there is currently no timeout or fallback of
any kind in the Direct Play path.** `loadVideo()` (WatchPage.js:450-618) either takes the
Direct Play branch (line ~608-615: `video.src = finalUrl; video.play()`) and then does nothing
further to detect a stall, or takes the Auto-Transcode/remux branches (lines 486-537) which
route through the server (`/api/transcode`, `/api/remux`) and *do* work via ffmpeg. So a
known-working fallback path already exists in this codebase — it's just never invoked for a
Direct Play stream that probed as "compatible" but then stalls on the actual CDN fetch.

## Next step (where to resume)

The user agreed to a **live debug**: naming a movie that is hanging *right now* so the
network trace can be captured at the exact moment it stalls, to nail which of the three
hypotheses above (or something else) is actually happening. This was interrupted before the
user supplied a title.

However, the core architectural gap has been resolved: regardless of whether the stall is caused by a flaky CDN mirror node, range-request non-compliance, or mixed content, the player now detects the stall and falls back gracefully instead of hanging indefinitely.

## Resolution

A browser-side stall detection timeout and fallback mechanism has been implemented:

1. **Stall Detection (8s Timeout):** When Direct Play is initiated in `loadVideo()`, a 8-second timer (`this.directPlayTimeout`) is started.
2. **Success Path:** If the browser successfully connects, resolves range requests, and loads the video metadata (`loadedmetadata` event fires), `onMetadataLoaded()` is called, which clears the timeout.
3. **Fallback Path:** If `readyState` remains `0` (`HAVE_NOTHING`) after 8 seconds, the timeout fires:
   - It pauses the video, empties the source, and triggers `load()` to release the stalled connection.
   - It updates the transcode status UI to `Stalled -> Remuxing (Fallback)`.
   - It starts a server-side HLS transcode/copy session (`videoMode: 'copy'`) with the same stream details, falling back to a seekable HLS stream served by FFmpeg on our server. FFmpeg handles range requests and CDN connectivity far more robustly than the browser.
4. **Cleanup:** The timeout is also cleared immediately if playback is stopped/interrupted (`stop()`).

## Relevant files

- `public/js/pages/WatchPage.js` — `loadVideo()` (~450), `onMetadataLoaded()` (~866),
  `stop()` (~677)
- `server/routes/probe.js` — ffprobe-based compatibility check (recently tuned for speed,
  confirmed fast — ~60ms in trace — not implicated)
- `server/index.js` — Xtream proxy routes (`/api/proxy/xtream/...`)
