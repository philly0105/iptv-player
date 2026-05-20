# UI Modernisation — Design Spec
_2026-05-13_

## Goal

Make the IPTV Player look more modern by switching from a top navbar to a collapsible left sidebar and updating the colour system from indigo/blue-black to amber/warm-black.

## Scope

Approach 1 — CSS variables + nav restructure only. No changes to page components (channel list, EPG grid, player, movies/series cards) beyond what the colour swap provides for free.

Files touched:
- `public/css/main.css` — colour variables + sidebar styles + polish rules
- `public/index.html` — replace `<nav>` with `<aside class="sidebar">`
- `public/js/` — ~25-line sidebar collapse toggle (new file or appended to `auth.js`)

---

## Section 1 — Colour System

Swap `:root` CSS variables. All existing component rules pick up the new values automatically.

| Variable | Old | New |
|---|---|---|
| `--color-bg-primary` | `#0a0a0f` | `#0c0b0a` |
| `--color-bg-secondary` | `#12121a` | `#111009` |
| `--color-bg-tertiary` | `#1a1a25` | `#1a1713` |
| `--color-bg-hover` | `#22222f` | `#22201a` |
| `--color-bg-active` | `#2a2a3a` | `#2a2318` |
| `--color-accent` | `#6366f1` | `#f59e0b` |
| `--color-accent-hover` | `#818cf8` | `#fbbf24` |
| `--color-accent-dim` | `rgba(99,102,241,0.2)` | `rgba(245,158,11,0.15)` |
| `--color-border` | `#27272a` | `#252220` |
| `--color-border-light` | `#3f3f46` | `#3a3530` |
| `--shadow-glow` | `0 0 20px rgba(99,102,241,0.3)` | `0 0 20px rgba(245,158,11,0.25)` |
| `--glass-bg` | `rgba(18,18,26,0.8)` | `rgba(17,16,9,0.8)` |

---

## Section 2 — Nav Restructure

### Layout

Remove the top `<nav class="navbar">` from `index.html`. The `#app` flex direction changes from `column` to `row`.

```
#app  { display: flex; flex-direction: row; }
  <aside class="sidebar">   /* fixed width, full height */
  <main class="main-content">  /* flex: 1 */
```

New layout variables (replace `--navbar-height`):
```css
--sidebar-width: 160px;
--sidebar-width-collapsed: 52px;
```

### Sidebar structure (HTML)

```html
<aside class="sidebar" id="sidebar">
  <nav class="sidebar-nav">
    <a class="sidebar-link active" data-page="home">   <icon> <span>Home</span>      </a>
    <a class="sidebar-link"        data-page="live">   <icon> <span>Live TV</span>   </a>
    <a class="sidebar-link"        data-page="guide">  <icon> <span>TV Guide</span>  </a>
    <a class="sidebar-link"        data-page="movies"> <icon> <span>Movies</span>    </a>
    <a class="sidebar-link"        data-page="series"> <icon> <span>Series</span>    </a>
  </nav>
  <div class="sidebar-bottom">
    <a class="sidebar-link" data-page="settings"><icon> <span>Settings</span></a>
    <button class="sidebar-collapse-btn" id="sidebar-toggle" title="Collapse">«</button>
  </div>
</aside>
```

### Collapsed state

Toggle class `.collapsed` on `<aside>` via JS. CSS handles the width transition:

```css
.sidebar { width: var(--sidebar-width); transition: width 250ms ease; }
.sidebar.collapsed { width: var(--sidebar-width-collapsed); }
.sidebar.collapsed .sidebar-link span { display: none; }
.sidebar.collapsed .sidebar-collapse-btn { transform: rotate(180deg); }
```

Collapsed state persisted to `localStorage` key `sidebar-collapsed`.

### Active state per link

```css
.sidebar-link.active {
  color: var(--color-accent);
  background: var(--color-accent-dim);
  border-left: 3px solid var(--color-accent);
}
```

### Mobile

On screens `< 768px`: sidebar hides off-screen (`transform: translateX(-100%)`), a hamburger button in the top-left of `main-content` toggles it as a drawer overlay. Same `.collapsed` class mechanism, same JS toggle.

---

## Section 3 — CSS Polish

Targeted rule updates (not new components):

- **Cards**: `box-shadow` with `var(--shadow-glow)` on `:hover`
- **Buttons**: primary → amber background; ghost → amber border on `:hover`
- **Inputs**: amber focus ring (`outline: 2px solid var(--color-accent)`)
- **Scrollbars**: `scrollbar-color: var(--color-bg-hover) transparent`
- **`.version-badge`**: inherits accent colour automatically from variable swap
- **`.brand-text`**: colour set to `var(--color-accent)`

---

## What is Not Changing

- Channel list sidebar (`.channel-sidebar`) — untouched
- EPG grid layout — untouched
- Player controls — untouched
- Movie/Series card markup — untouched
- Any route/server code — untouched

---

## Success Criteria

1. Left sidebar renders at 160px with all nav items visible
2. Collapse button shrinks it to 52px (icons only); expand restores it
3. Collapse state survives page refresh
4. Active page highlights with amber left border
5. All existing pages still load and function correctly
6. Mobile: sidebar works as a drawer overlay
