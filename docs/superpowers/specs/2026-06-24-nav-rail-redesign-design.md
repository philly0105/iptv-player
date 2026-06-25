# Primary Navigation — Icon Rail (desktop) & Bottom Tab Bar (mobile)

**Date:** 2026-06-24
**Status:** Approved (design)

## Problem

The primary nav (`.nav-sidebar` in `public/index.html` / `public/css/main.css`) has
two issues flagged by the user:

1. **Sidebar layout** feels dated/cramped — a single flat list of icon+label rows
   in a column that's either ~158px (expanded) or 52px (collapsed), toggled by a
   manual button (`#nav-sidebar-toggle`), persisted via `localStorage`.
2. **Collapse/expand and the mobile drawer** feel mechanical — collapsing pushes
   `width`/`min-width` (`transition: width var(--transition-normal)`), and on
   mobile the same sidebar becomes a full drawer (`transform: translateX`) with a
   dark overlay (`.nav-sidebar-overlay`) toggled by a hamburger button
   (`.mobile-menu-btn`).

## Goal

Replace the toggle-driven expand/collapse sidebar and the mobile drawer with two
platform-appropriate, lower-friction patterns:

- **Desktop:** a permanent icon-only rail with hover tooltips — no manual
  collapse state to manage.
- **Mobile:** a persistent bottom tab bar — no drawer, no overlay, no open/close
  state.

## Decisions (from brainstorming)

- **Desktop rail is permanent, not toggleable.** `.nav-sidebar` is always 52px.
  `#nav-sidebar-toggle` and the `navSidebarCollapsed` localStorage key are deleted,
  not just hidden — there is no expanded state to return to.
- **Labels appear via hover tooltip only** (not a hover-expand panel). Each
  `.nav-link` shows a small CSS-only tooltip to the right of the icon on `:hover`/
  `:focus` (`position: absolute`, opacity/transform transition, no JS positioning).
  This was chosen over a VS-Code-style hover-expand panel — simpler, no risk of
  covering adjacent content, no extra JS.
- **Active state** keeps the existing left-border + `--color-accent-dim`
  background treatment — already legible at rail width, no further animation
  needed since there's no label to cross-fade anymore.
- **Now-playing indicator** becomes a rail icon with a small pulse-dot badge;
  hovering shows the current channel name via the same tooltip mechanism as nav
  items (replaces the current expanded text pill).
- **Settings and Logout** (Logout is injected client-side as a `.nav-link` in
  `app.js`) get the same icon + tooltip treatment as the rest of the rail — no
  change to their click behavior, only presentation.
- **Brand header** shrinks to just the logo mark (28px). The version badge (today
  shown next to the brand text) moves into the Settings tooltip/panel instead of
  being dropped.
- **Mobile: bottom tab bar replaces the drawer entirely.** `.nav-sidebar-overlay`,
  `.mobile-open` state, and `.mobile-menu-btn` are removed. A fixed bottom bar
  (56–60px tall) shows 5 equal-width icon+label buttons, always visible, no
  open/close state:
  1. Home
  2. Live TV
  3. Movies
  4. Series
  5. More
- **"More" opens a bottom sheet** (slide up from the bottom, dismiss via
  tap-outside or swipe-down — not a full-screen drawer) listing: TV Guide,
  Recordings, Multiview, Settings, Logout.
- **`.main-content` mobile padding** moves from `padding-top` (clearance for the
  old hamburger button) to `padding-bottom` (clearance for the new fixed bottom
  bar).

## Out of scope

- **Page-switch transition.** Pages still swap via `display: none` / `block`
  with no animation (`navigateTo()` in `app.js`, `.page.active` in `main.css`).
  Confirmed with the user this stays as-is — not one of the flagged pain points,
  and kept out to keep this change scoped to nav only.
- **Live TV channel sidebar.** The separate 320px channel list
  (`.channel-sidebar`) used inside the Live TV page is untouched. This spec only
  covers the primary app nav (the icon rail / bottom tab bar), not secondary
  in-page navigation.
- **Sliding "pill" active-indicator animation.** Considered during brainstorming
  but dropped — neither the icon-only rail nor the always-labeled bottom tab bar
  has the kind of varying-width active state that a sliding pill is meant to
  solve.

## Affected files (for the implementation plan)

- `public/index.html` — nav markup: collapse toggle removed, mobile hamburger
  button removed, bottom tab bar + "More" sheet markup added.
- `public/css/main.css` — rail width fixed (no `.collapsed` variant), tooltip
  styles, bottom tab bar + sheet styles, mobile media query rewritten.
- `public/js/app.js` — remove collapse-toggle / localStorage logic and
  mobile-drawer-overlay logic (`navSidebarToggle`, `mobileMenuBtn`,
  `nav-sidebar-overlay` listeners); add "More" sheet open/close handling.
