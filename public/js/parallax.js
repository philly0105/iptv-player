/**
 * Parallax Poster Card — vanilla JS implementation
 * Mirrors the Framer Motion 3D tilt + specular glare physics from the Apple TV+ design.
 *
 * Targets: .movie-card  .series-card  .dashboard-card
 *
 * Physics:
 *  - Mouse position is normalized to [-1, 1] relative to card centre.
 *  - Spring interpolation runs each animation frame toward the target.
 *  - rotateX / rotateY are derived from the spring values.
 *  - A radial-gradient glare follows the cursor position exactly.
 */
(function () {
  'use strict';

  // Only activate on pointer-capable (non-touch) devices
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const SELECTOR    = '.movie-card, .series-card, .dashboard-card';
  const TILT_MAX    = 12;   // degrees
  const SCALE_ON    = 1.06;
  const STIFFNESS   = 0.14; // spring stiffness (0–1: lower = softer)
  const DAMPING     = 0.75; // spring damping (0–1: higher = snappier settle)
  const PERSPECTIVE = '1200px';

  // Map of card element → spring state
  const springs = new WeakMap();

  // ── Spring state per card ──────────────────────────────────────────────────
  function createState() {
    return {
      // Current spring position (what's on screen)
      cx: 0, cy: 0,
      // Velocity
      vx: 0, vy: 0,
      // Target (mouse position)
      tx: 0, ty: 0,
      // Cursor for glare (0–1 within card)
      gx: 0.5, gy: 0.5,
      hovered: false,
      rafId: null,
    };
  }

  // ── Animate one frame ──────────────────────────────────────────────────────
  function tick(card, state) {
    const dx = state.tx - state.cx;
    const dy = state.ty - state.cy;

    state.vx = state.vx * DAMPING + dx * STIFFNESS;
    state.vy = state.vy * DAMPING + dy * STIFFNESS;
    state.cx += state.vx;
    state.cy += state.vy;

    const rotX =  state.cy * TILT_MAX;
    const rotY =  state.cx * TILT_MAX;
    const scale = state.hovered ? SCALE_ON : 1;

    card.style.transform =
      `perspective(${PERSPECTIVE}) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`;

    // Update glare overlay
    const glare = card._glare;
    if (glare) {
      glare.style.background =
        `radial-gradient(circle at ${state.gx * 100}% ${state.gy * 100}%, ` +
        `rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 35%, transparent 65%)`;
      glare.style.opacity = state.hovered ? '1' : '0';
    }

    // Keep running while hovered OR while spring is still moving
    const moving = Math.abs(state.vx) > 0.0005 || Math.abs(state.vy) > 0.0005;
    if (state.hovered || moving) {
      state.rafId = requestAnimationFrame(() => tick(card, state));
    } else {
      state.rafId = null;
      // Fully reset transform when settled
      card.style.transform = '';
    }
  }

  // ── Start spring loop ──────────────────────────────────────────────────────
  function startLoop(card, state) {
    if (!state.rafId) {
      state.rafId = requestAnimationFrame(() => tick(card, state));
    }
  }

  // ── Attach to a card ──────────────────────────────────────────────────────
  function attach(card) {
    if (card._parallax) return; // already initialised
    card._parallax = true;

    // Inject glare div
    const glare = document.createElement('div');
    glare.className = 'card-glare';
    card.appendChild(glare);
    card._glare = glare;

    const state = createState();
    springs.set(card, state);

    card.addEventListener('mouseenter', () => {
      state.hovered = true;
      card.style.transition = 'box-shadow 0.35s ease';
      startLoop(card, state);
    });

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      // Normalised 0→1 within card
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top)  / rect.height;

      // Clamp to [0,1]
      state.gx = Math.max(0, Math.min(1, px));
      state.gy = Math.max(0, Math.min(1, py));

      // Normalise to [-1,1] for rotation (0.5 = centre = no tilt)
      state.tx = (px - 0.5) * 2;
      state.ty = (py - 0.5) * 2;
    });

    card.addEventListener('mouseleave', () => {
      state.hovered = false;
      state.tx = 0;
      state.ty = 0;
      // Let spring settle back
      card.style.transition = 'box-shadow 0.35s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1)';
      startLoop(card, state);
    });
  }

  // ── Watch for dynamically added cards ─────────────────────────────────────
  function scanAndAttach() {
    document.querySelectorAll(SELECTOR).forEach(attach);
  }

  const observer = new MutationObserver(scanAndAttach);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial pass once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndAttach);
  } else {
    scanAndAttach();
  }
})();
