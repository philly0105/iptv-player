# Nav Rail / Bottom Tab Bar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toggle-driven collapsible sidebar and mobile drawer with a permanent icon-only rail (hover tooltips) on desktop and a persistent bottom tab bar + "More" sheet on mobile.

**Architecture:** CSS handles all the new visual states — a fixed 52px rail with `position:absolute` hover tooltips (no JS positioning needed since the rail width is constant), and a mobile bottom tab bar / sheet shown only via media query. HTML drops the collapse-toggle and hamburger-menu markup and adds the bottom tab bar + sheet markup, reusing existing `data-page` attributes so `app.js`'s routing keeps working with one broadened selector. `app.js` removes the collapse/drawer wiring and adds "More" sheet open/close wiring.

**Tech Stack:** Vanilla HTML, CSS custom properties, vanilla JS (ES6 classes). No build step — edit files and refresh browser. No test runner in this repo; verification is manual (run the dev server, check in browser at desktop and mobile widths).

**Spec:** `docs/superpowers/specs/2026-06-24-nav-rail-redesign-design.md`

## Global Constraints

- Page-switch behavior (`display:none`/`block` swap in `navigateTo()`) is unchanged — out of scope per spec.
- The Live TV channel sidebar (`.channel-sidebar`, `#channel-toggle-btn`, `#channel-sidebar-overlay`) and its own collapse logic in `app.js` are a different feature — do not touch.
- Bottom mobile tab bar primary items: Home, Live TV, Movies, Series, More. "More" sheet items: TV Guide, Recordings, Multiview, Settings, Logout.

---

## File map

| File | Change |
|------|--------|
| `public/css/main.css` | Shrink `--nav-sidebar-width` to 52px, delete `--nav-sidebar-width-collapsed`; replace the entire nav-sidebar CSS block (collapse/toggle/drawer/overlay/hamburger) with rail + tooltip + bottom-tab-bar + more-sheet CSS |
| `public/index.html` | Replace nav markup: drop collapse toggle, brand text, old version-badge location, mobile overlay, hamburger button; add bottom tab bar + "More" sheet markup |
| `public/js/app.js` | Remove collapse-toggle/localStorage and mobile-drawer wiring; add "More" sheet wiring; broaden nav click/active-state selectors to cover rail + tab bar + sheet; rewrite `addLogoutButton()` for both surfaces; broaden viewer settings-hide to both surfaces |

---

## Task 1: CSS — rail, tooltips, bottom tab bar, "More" sheet

**Files:**
- Modify: `public/css/main.css` lines 62–63 (`:root` layout vars)
- Modify: `public/css/main.css` lines 169–450 (nav-sidebar block through the mobile-menu-btn media query)

**Interfaces:**
- Produces: `.nav-link-label` becomes a hover-revealed tooltip (used by `.nav-link`, and by `.now-playing-text` once Task 2 adds the `nav-link-label` class to it). New classes for Task 2 to use: `.bottom-tab-bar`, `.tab-link`, `.tab-icon`, `.tab-label`, `.more-sheet-overlay`, `.more-sheet`, `.more-sheet-handle`, `.more-sheet-link`.

- [ ] **Step 1: Shrink the rail width variables**

In `public/css/main.css`, replace lines 62–63:

```css
  --nav-sidebar-width: 160px;
  --nav-sidebar-width-collapsed: 52px;
```

with:

```css
  --nav-sidebar-width: 52px;
```

- [ ] **Step 2: Replace the nav-sidebar CSS block**

Replace lines 169–450 (everything from `.nav-sidebar {` through the closing `}` of the `@media (min-width: 768px) { .mobile-menu-btn { display: none; } }` block) with:

```css
.nav-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--nav-sidebar-width);
  min-width: var(--nav-sidebar-width);
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  z-index: 100;
  flex-shrink: 0;
}

.nav-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
  min-height: 56px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  color: var(--color-accent);
  flex-shrink: 0;
}

.nav-sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-sm);
  gap: 4px;
}

.nav-link {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  transition: all var(--transition-fast);
}

.nav-link:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.nav-link.active {
  color: var(--color-accent);
  background: var(--color-accent-dim);
  border-left-color: var(--color-accent);
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.nav-icon svg {
  width: 18px;
  height: 18px;
}

/* Hover tooltip. Also used by .now-playing-text (Task 2 adds this class to
   it) and wraps the version badge inside the Settings tooltip. The rail's
   width is fixed, so this never needs JS positioning. */
.nav-link-label {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-md);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  z-index: 150;
}

.nav-link:hover .nav-link-label,
.nav-link:focus-visible .nav-link-label {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.version-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 0.6rem;
  font-weight: 600;
  background: var(--color-accent);
  color: #000;
  padding: 2px 5px;
  border-radius: 10px;
  white-space: nowrap;
}

.now-playing-indicator {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  color: var(--color-accent);
  text-decoration: none;
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
  background: var(--color-accent-dim);
  animation: pulse-border 2s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-left-color: var(--color-accent); }
  50% { border-left-color: transparent; }
}

.now-playing-icon {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.nav-sidebar-bottom {
  display: flex;
  flex-direction: column;
  padding: var(--space-sm);
  gap: 4px;
  border-top: 1px solid var(--color-border);
}

/* Mobile bottom tab bar & "More" sheet — replace the old drawer / overlay /
   hamburger pattern entirely. Hidden on desktop. */
.bottom-tab-bar {
  display: none;
}

.more-sheet-overlay {
  display: none;
}

.more-sheet {
  display: none;
}

@media (max-width: 767px) {
  #app {
    flex-direction: column;
  }

  .nav-sidebar {
    display: none;
  }

  .main-content {
    padding-bottom: calc(60px + var(--safe-area-inset-bottom));
  }

  .bottom-tab-bar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: calc(60px + var(--safe-area-inset-bottom));
    padding-bottom: var(--safe-area-inset-bottom);
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
    z-index: 200;
  }

  .tab-link {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    font-family: inherit;
    color: var(--color-text-secondary);
    text-decoration: none;
    cursor: pointer;
  }

  .tab-link.active {
    color: var(--color-accent);
  }

  .tab-icon svg {
    width: 22px;
    height: 22px;
  }

  .tab-label {
    font-size: 0.65rem;
    font-weight: 500;
  }

  .more-sheet-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-normal);
    z-index: 190;
  }

  .more-sheet-overlay.active {
    opacity: 1;
    pointer-events: auto;
  }

  .more-sheet {
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding: var(--space-sm);
    padding-bottom: calc(60px + var(--space-sm) + var(--safe-area-inset-bottom));
    transform: translateY(100%);
    transition: transform var(--transition-normal);
    pointer-events: none;
    z-index: 201;
  }

  .more-sheet.active {
    transform: translateY(0);
    pointer-events: auto;
  }

  .more-sheet-handle {
    width: 36px;
    height: 4px;
    margin: 4px auto 12px;
    background: var(--color-border-light);
    border-radius: var(--radius-full);
  }

  .more-sheet-link {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 12px var(--space-sm);
    color: var(--color-text-secondary);
    text-decoration: none;
    border-radius: var(--radius-md);
  }

  .more-sheet-link:hover,
  .more-sheet-link:active {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
}
```

Note: `.brand-text` and the old `.now-playing-text { overflow:hidden; text-overflow:ellipsis }` rules are intentionally dropped — Task 2 removes the `brand-text` element and merges `now-playing-text` into the new tooltip class, so both old rules become dead code.

- [ ] **Step 3: Verify in browser**

Run `npm start`, open `http://localhost:3000`. The layout will look broken (old HTML still has the toggle button, hamburger button, and inline labels next to icons) — that's expected, Task 2 fixes the HTML. Just confirm there are no CSS parse errors in the devtools console.

- [ ] **Step 4: Commit**

```bash
git add public/css/main.css
git commit -m "style: add nav rail/tooltip/bottom-tab-bar CSS, remove collapse/drawer CSS"
```

---

## Task 2: HTML — rail markup + bottom tab bar + "More" sheet

**Files:**
- Modify: `public/index.html` lines 24–88 (nav sidebar through the mobile menu button)

**Interfaces:**
- Consumes: CSS classes from Task 1 (`.nav-link-label`, `.bottom-tab-bar`, `.tab-link`, `.tab-icon`, `.tab-label`, `.more-sheet-overlay`, `.more-sheet`, `.more-sheet-handle`, `.more-sheet-link`).
- Produces: every nav-trigger element (rail `.nav-link`, `.tab-link[data-page]`, `.more-sheet-link`) carries a `data-page` attribute matching one of `home`, `live`, `guide`, `movies`, `series`, `recordings`, `multiview`, `settings`, `watch` — Task 3's broadened selectors rely on this.

- [ ] **Step 1: Replace the nav block**

Replace lines 24–88 of `public/index.html` (from `<!-- Nav Sidebar -->` through the closing `</button>` of the mobile menu button) with:

```html
    <!-- Nav Rail (desktop) -->
    <aside class="nav-sidebar" id="nav-sidebar">
      <div class="nav-sidebar-header">
        <svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zm-8-9l-5 3 5 3V8z"/>
        </svg>
      </div>

      <nav class="nav-sidebar-nav" id="nav-sidebar-nav">
        <!-- Now Playing indicator -->
        <a href="#" class="now-playing-indicator hidden" id="now-playing-indicator" data-page="watch">
          <span class="now-playing-icon">▶</span>
          <span class="now-playing-text nav-link-label" id="now-playing-text">Now Playing</span>
        </a>

        <a href="#" class="nav-link active" data-page="home">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></span>
          <span class="nav-link-label">Home</span>
        </a>
        <a href="#" class="nav-link" data-page="live">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8a2 2 0 0 0-2-2zm0 14H3V8h18v12zM9 10v8l7-4z"/></svg></span>
          <span class="nav-link-label">Live TV</span>
        </a>
        <a href="#" class="nav-link" data-page="guide">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg></span>
          <span class="nav-link-label">TV Guide</span>
        </a>
        <a href="#" class="nav-link" data-page="movies">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V4h-4z"/></svg></span>
          <span class="nav-link-label">Movies</span>
        </a>
        <a href="#" class="nav-link" data-page="series">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></span>
          <span class="nav-link-label">Series</span>
        </a>
        <a href="#" class="nav-link" data-page="recordings">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg></span>
          <span class="nav-link-label">Recordings</span>
        </a>
        <a href="#" class="nav-link" data-page="multiview">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg></span>
          <span class="nav-link-label">Multiview</span>
        </a>
      </nav>

      <div class="nav-sidebar-bottom">
        <a href="#" class="nav-link" data-page="settings">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.16 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.04.64.09.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg></span>
          <span class="nav-link-label">Settings<span id="version-badge" class="version-badge"></span></span>
        </a>
      </div>
    </aside>

    <!-- Mobile bottom tab bar -->
    <nav class="bottom-tab-bar" id="bottom-tab-bar">
      <a href="#" class="tab-link active" data-page="home">
        <span class="tab-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></span>
        <span class="tab-label">Home</span>
      </a>
      <a href="#" class="tab-link" data-page="live">
        <span class="tab-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8a2 2 0 0 0-2-2zm0 14H3V8h18v12zM9 10v8l7-4z"/></svg></span>
        <span class="tab-label">Live TV</span>
      </a>
      <a href="#" class="tab-link" data-page="movies">
        <span class="tab-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V4h-4z"/></svg></span>
        <span class="tab-label">Movies</span>
      </a>
      <a href="#" class="tab-link" data-page="series">
        <span class="tab-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></span>
        <span class="tab-label">Series</span>
      </a>
      <button type="button" class="tab-link" id="more-tab-btn">
        <span class="tab-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg></span>
        <span class="tab-label">More</span>
      </button>
    </nav>

    <!-- Mobile "More" sheet -->
    <div class="more-sheet-overlay" id="more-sheet-overlay"></div>
    <div class="more-sheet" id="more-sheet">
      <div class="more-sheet-handle"></div>
      <a href="#" class="more-sheet-link" data-page="guide">
        <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg></span>
        <span>TV Guide</span>
      </a>
      <a href="#" class="more-sheet-link" data-page="recordings">
        <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg></span>
        <span>Recordings</span>
      </a>
      <a href="#" class="more-sheet-link" data-page="multiview">
        <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg></span>
        <span>Multiview</span>
      </a>
      <a href="#" class="more-sheet-link" data-page="settings">
        <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.16 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.04.64.09.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg></span>
        <span>Settings</span>
      </a>
    </div>
```

- [ ] **Step 2: Verify in browser**

Reload `http://localhost:3000` at a desktop width (>767px). You should see a 52px icon-only rail with no toggle button. Hovering an icon should show its label in a tooltip to the right. Clicking icons should still navigate between pages — the original `.nav-link`-only click handler in `app.js` hasn't changed yet (that's Task 3), but rail links still carry the `.nav-link` class, so it already works.

Resize the browser to under 767px (or use devtools device mode). The rail should disappear and a 5-item bottom tab bar should appear, but tapping its items won't navigate yet and the "More" button won't open anything — that's expected, Task 3 wires that up.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: replace nav sidebar markup with icon rail + bottom tab bar + more sheet"
```

---

## Task 3: JS — wire "More" sheet, broaden nav selectors, fix logout/viewer-hide for both surfaces

**Files:**
- Modify: `public/js/app.js`

**Interfaces:**
- Consumes: `#more-tab-btn`, `#more-sheet`, `#more-sheet-overlay`, `.more-sheet-link` (Task 2 markup); `[data-page]` attribute shared by rail links, tab-bar links, and sheet links (Task 2 markup).
- Produces: `App.navigateTo(pageName, replaceHistory)` keeps its existing signature; `App.addLogoutButton()` keeps its existing signature (called once from `checkAuth()`, unchanged call site).

- [ ] **Step 1: Replace the desktop-collapse + mobile-drawer block with "More" sheet wiring**

In `app.js`, inside `async init()`, replace lines 35–68 (from `// Nav sidebar — desktop collapse toggle` through the closing `});` of the `document.querySelectorAll('.nav-link').forEach(link => { link.addEventListener('click', closeMobileNav); });` block) with:

```js
        // Mobile bottom tab bar — "More" sheet
        const moreTabBtn = document.getElementById('more-tab-btn');
        const moreSheet = document.getElementById('more-sheet');
        const moreSheetOverlay = document.getElementById('more-sheet-overlay');

        const closeMoreSheet = () => {
            moreSheet?.classList.remove('active');
            moreSheetOverlay?.classList.remove('active');
        };

        moreTabBtn?.addEventListener('click', () => {
            moreSheet?.classList.toggle('active');
            moreSheetOverlay?.classList.toggle('active');
        });

        moreSheetOverlay?.addEventListener('click', closeMoreSheet);

        document.querySelectorAll('.more-sheet-link').forEach(link => {
            link.addEventListener('click', closeMoreSheet);
        });
```

- [ ] **Step 2: Broaden the navigation click handler**

Still in `init()`, find (now a few lines further down, after the unchanged channel-drawer and channel-sidebar-collapse blocks):

```js
        // Navigation handling
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });
```

Replace with:

```js
        // Navigation handling — rail (desktop), bottom tabs + "More" sheet (mobile)
        document.querySelectorAll('.nav-link, .tab-link[data-page], .more-sheet-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });
```

(`.tab-link[data-page]` excludes `#more-tab-btn`, which has no `data-page` — it already has its own listener from Step 1.)

- [ ] **Step 3: Broaden the viewer settings-hide logic**

In `checkAuth()`, find:

```js
            // Hide settings for viewers
            if (this.currentUser.role === 'viewer') {
                const settingsLink = document.querySelector('.nav-link[data-page="settings"]');
                if (settingsLink) {
                    settingsLink.style.display = 'none';
                }
            }
```

Replace with:

```js
            // Hide settings for viewers (rail link + "More" sheet link)
            if (this.currentUser.role === 'viewer') {
                document.querySelectorAll('[data-page="settings"]').forEach(link => {
                    link.style.display = 'none';
                });
            }
```

- [ ] **Step 4: Rewrite `addLogoutButton()` for both surfaces**

Replace the entire `addLogoutButton()` method:

```js
    addLogoutButton() {
        const navbar = document.querySelector('.nav-sidebar-bottom');
        if (!navbar || document.getElementById('logout-btn')) return;

        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.className = 'nav-link';
        logoutLink.id = 'logout-btn';
        logoutLink.innerHTML = `
            <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg></span>
            <span>Logout</span>
        `;

        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();

            const token = localStorage.getItem('authToken');
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            localStorage.removeItem('authToken');
            window.location.replace('/login.html');
        });

        navbar.appendChild(logoutLink);
    }
```

with:

```js
    addLogoutButton() {
        if (document.getElementById('logout-btn')) return;

        const logoutHandler = async (e) => {
            e.preventDefault();

            const token = localStorage.getItem('authToken');
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            localStorage.removeItem('authToken');
            window.location.replace('/login.html');
        };

        const logoutIconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg>
        `;

        // Rail (desktop)
        const railNavbar = document.querySelector('.nav-sidebar-bottom');
        if (railNavbar) {
            const railLogout = document.createElement('a');
            railLogout.href = '#';
            railLogout.className = 'nav-link';
            railLogout.id = 'logout-btn';
            railLogout.innerHTML = `
                <span class="nav-icon">${logoutIconSvg}</span>
                <span class="nav-link-label">Logout</span>
            `;
            railLogout.addEventListener('click', logoutHandler);
            railNavbar.appendChild(railLogout);
        }

        // "More" sheet (mobile)
        const moreSheet = document.getElementById('more-sheet');
        if (moreSheet) {
            const sheetLogout = document.createElement('a');
            sheetLogout.href = '#';
            sheetLogout.className = 'more-sheet-link';
            sheetLogout.innerHTML = `
                <span class="nav-icon">${logoutIconSvg}</span>
                <span>Logout</span>
            `;
            sheetLogout.addEventListener('click', logoutHandler);
            moreSheet.appendChild(sheetLogout);
        }
    }
```

- [ ] **Step 5: Broaden the active-state sync in `navigateTo()`, highlight "More" when relevant**

In `navigateTo(pageName, replaceHistory)`, find:

```js
        // Update nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageName);
        });
```

Replace with:

```js
        // Update nav — rail, bottom tabs, and the "More" sheet all share data-page
        document.querySelectorAll('[data-page]').forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageName);
        });

        // Highlight the "More" tab when the active page lives inside its sheet
        const moreTabBtn = document.getElementById('more-tab-btn');
        moreTabBtn?.classList.toggle('active', ['guide', 'recordings', 'multiview', 'settings'].includes(pageName));
```

- [ ] **Step 6: Verify in browser**

Run `npm start`, open `http://localhost:3000`, log in.

Desktop width: hover each rail icon and confirm its tooltip appears to the right with the correct label; hover Settings and confirm the version number badge appears inside its tooltip; click through Home/Live TV/Guide/Movies/Series/Recordings/Multiview/Settings and confirm the page changes and the correct icon highlights; confirm Logout appears at the bottom of the rail and logs you out.

Resize below 767px: confirm the rail is gone and the bottom tab bar shows Home/Live TV/Movies/Series/More; tap each and confirm navigation + active-tab highlight; tap "More", confirm the sheet slides up over a dimmed backdrop showing TV Guide/Recordings/Multiview/Settings/Logout; tap a sheet item and confirm it navigates and the sheet closes; tap "More" again, then tap the dark backdrop, and confirm the sheet closes without navigating; navigate to Settings via the sheet and confirm the "More" tab itself shows as active.

If a test/viewer-role account is available, confirm Settings is hidden from both the rail and the "More" sheet for that role.

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js
git commit -m "feat: wire more-sheet, broaden nav selectors, fix logout/viewer-hide for rail+mobile"
```
