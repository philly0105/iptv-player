# UI Modernisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top navbar with a collapsible left sidebar and update the colour palette from indigo/blue-black to amber/warm-black.

**Architecture:** CSS variable swap handles the colour change with no component changes. A new `<aside class="nav-sidebar">` replaces the `<nav class="navbar">` in `index.html`; `#app` shifts from `flex-direction: column` to `row`. The JS toggle adds/removes `.collapsed` on the sidebar and persists to `localStorage`. Existing `.nav-link` selectors in `app.js` continue working unchanged except for two references (`navbar-menu`, `mobile-menu-toggle`) that are removed.

**Tech Stack:** Vanilla HTML, CSS custom properties, vanilla JS (ES6 classes). No build step — edit files and refresh browser.

---

## File map

| File | Change |
|------|--------|
| `public/css/main.css` | Update `:root` colour variables; replace `.navbar` block with `.nav-sidebar` block; add polish rules |
| `public/index.html` | Replace `<nav class="navbar">…</nav>` with `<aside class="nav-sidebar">…</aside>` |
| `public/js/app.js` | Remove mobile-menu-toggle block; update `addLogoutButton` target; add sidebar collapse toggle |

---

## Task 1: Swap colour variables in `main.css`

**Files:**
- Modify: `public/css/main.css` lines 1–71 (`:root` block)

- [ ] **Step 1: Update `:root` colour and layout variables**

Replace the entire `:root` block (lines 5–71) with:

```css
/* CSS Variables */
:root {
  /* iOS Safari toolbar compensation (set dynamically by JS) */
  --ios-ui-bottom: 0px;

  /* Colors */
  --color-bg-primary: #0c0b0a;
  --color-bg-secondary: #111009;
  --color-bg-tertiary: #1a1713;
  --color-bg-hover: #22201a;
  --color-bg-active: #2a2318;

  --color-accent: #f59e0b;
  --color-accent-hover: #fbbf24;
  --color-accent-dim: rgba(245, 158, 11, 0.15);

  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;

  --color-text-primary: #f1f1f5;
  --color-text-secondary: #a1a1aa;
  --color-text-muted: #71717a;

  --color-border: #252220;
  --color-border-light: #3a3530;

  /* Glass effect */
  --glass-bg: rgba(17, 16, 9, 0.8);
  --glass-border: rgba(255, 255, 255, 0.08);

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* Border Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(245, 158, 11, 0.25);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;

  /* Layout */
  --nav-sidebar-width: 160px;
  --nav-sidebar-width-collapsed: 52px;
  --sidebar-width: 320px;
  --epg-sidebar-width: 250px;

  /* Safe area insets for notched devices */
  --safe-area-inset-top: env(safe-area-inset-top, 0px);
  --safe-area-inset-right: env(safe-area-inset-right, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left: env(safe-area-inset-left, 0px);
}
```

Note: `--sidebar-width: 320px` is kept unchanged — it is used by the channel list sidebar (`.channel-sidebar`). New variables `--nav-sidebar-width` and `--nav-sidebar-width-collapsed` are added for the nav sidebar.

- [ ] **Step 2: Verify colour swap looks right**

Run `npm run dev`, open `http://localhost:3000`. The background should look warm/brown-black. Buttons, active states, and accent elements should be amber. No layout changes yet.

- [ ] **Step 3: Commit**

```bash
git add public/css/main.css
git commit -m "style: swap colour palette from indigo/blue-black to amber/warm-black"
```

---

## Task 2: Replace `.navbar` CSS with `.nav-sidebar` CSS in `main.css`

**Files:**
- Modify: `public/css/main.css` — replace the `Navbar` section (lines ~159–298) with the sidebar block below

- [ ] **Step 1: Replace the entire Navbar section**

Find the block starting with `/* ===…Navbar… */` down to and including `.nav-icon { font-size: 1.1rem; }` and replace it with:

```css
/* =====================================================
   App Layout
   ===================================================== */
#app {
  flex-direction: row;
}

/* =====================================================
   Nav Sidebar
   ===================================================== */
.nav-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--nav-sidebar-width);
  min-width: var(--nav-sidebar-width);
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  transition: width var(--transition-normal), min-width var(--transition-normal);
  overflow: hidden;
  z-index: 100;
  flex-shrink: 0;
}

.nav-sidebar.collapsed {
  width: var(--nav-sidebar-width-collapsed);
  min-width: var(--nav-sidebar-width-collapsed);
}

.nav-sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-md);
  border-bottom: 1px solid var(--color-border);
  min-height: 56px;
  overflow: hidden;
}

.brand-text {
  font-family: 'Outfit', sans-serif;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-accent);
  white-space: nowrap;
  overflow: hidden;
}

.version-badge {
  font-size: 0.6rem;
  font-weight: 600;
  background: var(--color-accent);
  color: #000;
  padding: 2px 5px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-sidebar.collapsed .brand-text,
.nav-sidebar.collapsed .version-badge {
  display: none;
}

.nav-sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-sm);
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px var(--space-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  transition: all var(--transition-fast);
  white-space: nowrap;
  overflow: hidden;
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

.nav-link-label {
  font-size: 0.875rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-sidebar.collapsed .nav-link-label {
  display: none;
}

.nav-sidebar.collapsed .nav-link {
  justify-content: center;
  padding: 10px;
  border-left-color: transparent;
  border-radius: var(--radius-md);
}

.nav-sidebar.collapsed .nav-link.active {
  background: var(--color-accent-dim);
  color: var(--color-accent);
}

.now-playing-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px var(--space-sm);
  color: var(--color-accent);
  text-decoration: none;
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
  background: var(--color-accent-dim);
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
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

.now-playing-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-sidebar.collapsed .now-playing-indicator {
  justify-content: center;
  padding: 10px;
  border-left-color: transparent;
  border-radius: var(--radius-md);
}

.nav-sidebar.collapsed .now-playing-text {
  display: none;
}

.nav-sidebar-bottom {
  display: flex;
  flex-direction: column;
  padding: var(--space-sm);
  gap: 2px;
  border-top: 1px solid var(--color-border);
}

.nav-sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-sm);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.nav-sidebar-toggle:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.nav-sidebar-toggle svg {
  width: 18px;
  height: 18px;
  transition: transform var(--transition-normal);
}

.nav-sidebar.collapsed .nav-sidebar-toggle svg {
  transform: rotate(180deg);
}

/* Mobile nav sidebar — hidden off-screen, shown as drawer */
.nav-sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 90;
}

@media (max-width: 767px) {
  #app {
    flex-direction: column;
  }

  .nav-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: var(--nav-sidebar-width) !important;
    min-width: var(--nav-sidebar-width) !important;
    transform: translateX(-100%);
    transition: transform var(--transition-normal);
    z-index: 200;
  }

  .nav-sidebar.mobile-open {
    transform: translateX(0);
  }

  .nav-sidebar-overlay.active {
    display: block;
  }

  .nav-sidebar .nav-link-label {
    display: block !important;
  }

  .nav-sidebar .nav-sidebar-toggle {
    display: none;
  }

  .mobile-menu-btn {
    display: flex;
    position: fixed;
    top: var(--space-sm);
    left: var(--space-sm);
    z-index: 150;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .main-content {
    padding-top: 52px;
  }
}

@media (min-width: 768px) {
  .mobile-menu-btn {
    display: none;
  }
}

/* =====================================================
   Main Content & Pages
   ===================================================== */
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev`, open `http://localhost:3000`. The layout will look broken (old navbar still in HTML). That's expected — Task 3 fixes the HTML. Just confirm no CSS parse errors in devtools console.

- [ ] **Step 3: Commit**

```bash
git add public/css/main.css
git commit -m "style: add nav-sidebar CSS, remove navbar CSS"
```

---

## Task 3: Replace navbar HTML in `index.html`

**Files:**
- Modify: `public/index.html` — replace the `<nav class="navbar">` block and wrap `<main>` in a new flex container

- [ ] **Step 1: Replace the `<nav class="navbar">` block**

Find this in `index.html` (lines ~25–95):
```html
    <!-- Navigation -->
    <nav class="navbar">
      …entire navbar…
    </nav>
```

Replace it with:

```html
    <!-- Nav Sidebar -->
    <aside class="nav-sidebar" id="nav-sidebar">
      <div class="nav-sidebar-header">
        <span class="brand-text">IPTV</span>
        <span id="version-badge" class="version-badge"></span>
      </div>

      <nav class="nav-sidebar-nav" id="nav-sidebar-nav">
        <!-- Now Playing indicator -->
        <a href="#" class="now-playing-indicator hidden" id="now-playing-indicator" data-page="watch">
          <span class="now-playing-icon">▶</span>
          <span class="now-playing-text" id="now-playing-text">Now Playing</span>
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
      </nav>

      <div class="nav-sidebar-bottom">
        <a href="#" class="nav-link" data-page="settings">
          <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.16 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.04.64.09.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg></span>
          <span class="nav-link-label">Settings</span>
        </a>
        <button class="nav-sidebar-toggle" id="nav-sidebar-toggle" title="Collapse sidebar">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
      </div>
    </aside>

    <!-- Mobile sidebar overlay -->
    <div class="nav-sidebar-overlay" id="nav-sidebar-overlay"></div>

    <!-- Mobile menu button (visible on small screens) -->
    <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
    </button>
```

- [ ] **Step 2: Verify layout in browser**

Reload `http://localhost:3000`. You should see the amber sidebar on the left with nav items. Clicking items should navigate between pages. The collapse button at the bottom should shrink the sidebar to icons-only.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: replace top navbar with collapsible left sidebar"
```

---

## Task 4: Update `app.js` — wire sidebar toggle, fix navbar references

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Replace the mobile-menu-toggle block and add sidebar logic**

In `app.js`, find the `async init()` method. Replace lines 34–58 (the mobile menu toggle block):

```js
        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navbarMenu = document.getElementById('navbar-menu');

        if (mobileMenuToggle && navbarMenu) {
            mobileMenuToggle.addEventListener('click', () => {
                mobileMenuToggle.classList.toggle('active');
                navbarMenu.classList.toggle('active');
            });

            // Close menu when a nav link is clicked
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    mobileMenuToggle.classList.remove('active');
                    navbarMenu.classList.remove('active');
                });
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.navbar')) {
                    mobileMenuToggle.classList.remove('active');
                    navbarMenu.classList.remove('active');
                }
            });
        }
```

With:

```js
        // Nav sidebar — desktop collapse toggle
        const navSidebar = document.getElementById('nav-sidebar');
        const navSidebarToggle = document.getElementById('nav-sidebar-toggle');

        if (navSidebar && navSidebarToggle) {
            if (localStorage.getItem('navSidebarCollapsed') === 'true') {
                navSidebar.classList.add('collapsed');
            }

            navSidebarToggle.addEventListener('click', () => {
                navSidebar.classList.toggle('collapsed');
                localStorage.setItem('navSidebarCollapsed', navSidebar.classList.contains('collapsed'));
            });
        }

        // Nav sidebar — mobile drawer
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const navSidebarOverlay = document.getElementById('nav-sidebar-overlay');

        const closeMobileNav = () => {
            navSidebar?.classList.remove('mobile-open');
            navSidebarOverlay?.classList.remove('active');
        };

        mobileMenuBtn?.addEventListener('click', () => {
            navSidebar?.classList.toggle('mobile-open');
            navSidebarOverlay?.classList.toggle('active');
        });

        navSidebarOverlay?.addEventListener('click', closeMobileNav);

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', closeMobileNav);
        });
```

- [ ] **Step 2: Update `addLogoutButton` to target the sidebar**

Find `addLogoutButton()` method. Replace:
```js
    addLogoutButton() {
        const navbar = document.querySelector('.navbar-menu');
        if (!navbar || document.getElementById('logout-btn')) return;
```

With:
```js
    addLogoutButton() {
        const navbar = document.querySelector('.nav-sidebar-bottom');
        if (!navbar || document.getElementById('logout-btn')) return;
```

- [ ] **Step 3: Verify sidebar behaviour**

Reload `http://localhost:3000`.
- Click the collapse button (bottom of sidebar) — sidebar shrinks to 52px icons only.
- Refresh — collapsed state is preserved.
- Click expand — sidebar returns to 160px with labels.
- On mobile (resize browser to < 768px) — sidebar hides; hamburger button appears top-left; tapping it opens the sidebar as a drawer; tapping overlay closes it.
- Logout button should appear at the bottom of the sidebar.

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js
git commit -m "feat: wire sidebar collapse toggle and mobile drawer"
```

---

## Task 5: CSS polish — glow, focus rings, scrollbars, buttons

**Files:**
- Modify: `public/css/main.css` — add rules at the end of the file

- [ ] **Step 1: Append polish rules to the end of `main.css`**

Add to the very bottom of `public/css/main.css`:

```css
/* =====================================================
   Polish — hover glows, focus rings, scrollbars
   ===================================================== */

/* Card hover glow */
.channel-item:hover,
.movie-card:hover,
.series-card:hover,
.vod-card:hover {
  box-shadow: var(--shadow-glow);
  border-color: var(--color-border-light);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}

/* Amber focus ring on all interactive elements */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Amber focus ring on inputs */
.search-input:focus,
input:focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: 0;
  border-color: var(--color-accent);
}

/* Slim warm scrollbars */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-bg-hover) transparent;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: var(--color-bg-hover);
  border-radius: 3px;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-light);
}

/* Primary button — amber */
.btn-primary {
  background: var(--color-accent);
  color: #000;
  border-color: var(--color-accent);
}

.btn-primary:hover {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

/* Ghost button — amber border on hover */
.btn-ghost:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

- [ ] **Step 2: Verify polish in browser**

Reload `http://localhost:3000`.
- Hover over a channel item or movie card — amber glow appears.
- Click into a search input — amber focus ring appears.
- Scroll any list — slim warm scrollbar visible.
- Any primary buttons use amber background.

- [ ] **Step 3: Commit**

```bash
git add public/css/main.css
git commit -m "style: add card hover glow, focus rings, slim scrollbars, amber buttons"
```

---

## Task 6: Push to GitHub

- [ ] **Step 1: Verify all pages still work end-to-end**

With `npm run dev` running:
1. Navigate to Home — loads dashboard
2. Navigate to Live TV — channel list appears on left, player on right
3. Navigate to TV Guide — EPG grid renders
4. Navigate to Movies — grid renders
5. Navigate to Series — grid renders
6. Navigate to Settings — settings form renders
7. Collapse and expand sidebar — state persists on refresh

- [ ] **Step 2: Push**

```bash
git push origin main
```

---

## Self-review notes

- `--sidebar-width: 320px` kept for `.channel-sidebar` — no conflict with new `--nav-sidebar-width`
- `navigateTo()` uses `.nav-link` selector — unchanged, works with sidebar links
- `addLogoutButton` target changed from `.navbar-menu` to `.nav-sidebar-bottom` — logout button will appear above the collapse toggle
- Mobile: sidebar uses `position: fixed` + `transform` drawer pattern — doesn't affect flex layout
- `now-playing-indicator` is moved inside `.nav-sidebar-nav` — same `id="now-playing-indicator"` so existing JS still finds it
