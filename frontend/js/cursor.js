/* SoSpark Design v3 — Cursor (smaller, lighter blur) */
(function () {
  'use strict';
  if (window.matchMedia('(hover: none)').matches) return;

  const ring = document.createElement('div');
  const dot  = document.createElement('div');
  ring.id = 'ss-cursor-ring';
  dot.id  = 'ss-cursor-dot';

  const S = (el, s) => Object.assign(el.style, s);

  S(ring, {
    position: 'fixed', top: '0', left: '0',
    width: '32px', height: '32px',      /* smaller than before */
    borderRadius: '50%',
    border: '1.5px solid rgba(37,99,235,0.45)',
    background: 'rgba(37,99,235,0.04)', /* very light — text stays readable */
    backdropFilter: 'blur(4px)',         /* reduced from 8px */
    WebkitBackdropFilter: 'blur(4px)',
    pointerEvents: 'none', zIndex: '99999',
    transform: 'translate(-50%,-50%)',
    transition: 'width 280ms cubic-bezier(0.16,1,0.3,1), height 280ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, background 220ms ease, opacity 300ms ease',
    opacity: '0', willChange: 'transform',
  });

  S(dot, {
    position: 'fixed', top: '0', left: '0',
    width: '5px', height: '5px',
    borderRadius: '50%',
    background: '#2563EB',
    boxShadow: '0 0 6px rgba(37,99,235,0.7)',
    pointerEvents: 'none', zIndex: '100000',
    transform: 'translate(-50%,-50%)',
    opacity: '0', willChange: 'transform',
    transition: 'opacity 300ms ease, transform 150ms ease',
  });

  document.body.appendChild(ring);
  document.body.appendChild(dot);

  let mx = -100, my = -100, cx = -100, cy = -100;
  const lerp = (a, b, n) => a + (b - a) * n;

  (function tick() {
    cx = lerp(cx, mx, 0.11);
    cy = lerp(cy, my, 0.11);
    ring.style.left = cx + 'px';
    ring.style.top  = cy + 'px';
    dot.style.left  = mx + 'px';
    dot.style.top   = my + 'px';
    requestAnimationFrame(tick);
  })();

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (ring.style.opacity === '0') {
      ring.style.opacity = '1'; dot.style.opacity = '1';
      cx = mx; cy = my;
    }
  });
  document.addEventListener('mouseleave', () => { ring.style.opacity = '0'; dot.style.opacity = '0'; });

  const SEL = 'a, button, [role="button"], input, textarea, select, label, .service-card, .work-item, .review-card, .value-card';

  document.addEventListener('mouseover', e => {
    if (e.target.closest(SEL)) {
      S(ring, { width: '52px', height: '52px', borderColor: 'rgba(37,99,235,0.7)', background: 'rgba(37,99,235,0.06)' });
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(SEL)) {
      S(ring, { width: '32px', height: '32px', borderColor: 'rgba(37,99,235,0.45)', background: 'rgba(37,99,235,0.04)' });
    }
  });
  document.addEventListener('mousedown', () => { ring.style.transform = 'translate(-50%,-50%) scale(0.8)'; dot.style.transform = 'translate(-50%,-50%) scale(1.5)'; });
  document.addEventListener('mouseup',   () => { ring.style.transform = 'translate(-50%,-50%) scale(1)'; dot.style.transform  = 'translate(-50%,-50%) scale(1)'; });
})();
