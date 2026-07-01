/* ============================================
   SoSpark Design v3 — Animations
   Cinematic scroll, persistent motion, no dead states
   ============================================ */
(function () {
  'use strict';

  // ── Scroll Reveal (one-time, entrance only — ambient motion handles "alive" after) ──
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  // ── Cinematic scroll: side-by-side layered parallax (Figma-style scrubbing) ──
  const cinematicEls = document.querySelectorAll('[data-cinematic]');
  if (cinematicEls.length) {
    const cio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const dir = e.target.dataset.cinematic; // 'left' | 'right' | 'scale' | 'up'
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'none';
        } else {
          const rect = e.target.getBoundingClientRect();
          const offset = rect.top > window.innerHeight ? 60 : -60;
          if (dir === 'left')  e.target.style.transform = `translateX(${rect.top > window.innerHeight ? -60 : 60}px)`;
          if (dir === 'right') e.target.style.transform = `translateX(${rect.top > window.innerHeight ? 60 : -60}px)`;
          if (dir === 'scale') e.target.style.transform = 'scale(0.92)';
          if (dir === 'up')    e.target.style.transform = `translateY(${offset}px)`;
          e.target.style.opacity = '0';
        }
      });
    }, { threshold: 0.15 });
    cinematicEls.forEach(el => {
      el.style.opacity = '0';
      el.style.transition = 'transform 0.9s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.9s ease';
      cio.observe(el);
    });
  }

  // ── Layered depth parallax on scroll (multi-speed layers within sections) ──
  const depthLayers = document.querySelectorAll('[data-depth]');
  if (depthLayers.length) {
    let ticking = false;
    function updateDepth() {
      const sy = window.scrollY;
      depthLayers.forEach(el => {
        const speed = parseFloat(el.dataset.depth) || 0.1;
        const rect = el.getBoundingClientRect();
        const elTop = rect.top + sy;
        const offset = (sy - elTop) * speed;
        el.style.transform = `translateY(${offset}px)`;
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(updateDepth); ticking = true; }
    }, { passive: true });
    updateDepth();
  }

  // ── Counter animation ──
  function animateCounter(el, target, dur) {
    const start = performance.now();
    (function update(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(update);
      else el.textContent = target;
    })(start);
  }
  const counterEls = document.querySelectorAll('[data-counter]');
  if (counterEls.length && 'IntersectionObserver' in window) {
    const cio2 = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target, parseInt(e.target.dataset.counter, 10), 1600);
          cio2.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    counterEls.forEach(el => cio2.observe(el));
  }

  // ── Mouse-reactive 3D tilt on hero scene (subtle, persistent base motion continues via CSS) ──
  const scene = document.querySelector('.hero__3d-scene');
  if (scene) {
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    window.addEventListener('mousemove', e => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 14;
      targetY = (e.clientY / window.innerHeight - 0.5) * 14;
    });
    (function tiltLoop() {
      curX += (targetX - curX) * 0.04;
      curY += (targetY - curY) * 0.04;
      scene.style.transform = `rotateY(${curX}deg) rotateX(${-curY}deg)`;
      requestAnimationFrame(tiltLoop);
    })();
  }

  // ── Service card shimmer stagger index ──
  document.querySelectorAll('.service-card').forEach((card, i) => {
    card.style.setProperty('--card-i', i);
  });

  // ── Stagger child reveals ──
  document.querySelectorAll('[data-stagger]').forEach(parent => {
    Array.from(parent.children).forEach((child, i) => {
      child.classList.add('reveal');
      child.style.transitionDelay = (i * 80) + 'ms';
    });
  });

  // ── Page fade-in ──
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.4s ease';
  window.addEventListener('load', () => { document.body.style.opacity = '1'; });

  // ── Ripple on buttons ──
  document.querySelectorAll('.btn-primary, .btn-ghost').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height) * 2;
      Object.assign(ripple.style, {
        position: 'absolute', width: size+'px', height: size+'px',
        left: (e.clientX-rect.left-size/2)+'px', top: (e.clientY-rect.top-size/2)+'px',
        background: 'rgba(255,255,255,0.25)', borderRadius: '50%',
        transform: 'scale(0)', animation: 'rippleOut 0.5s ease-out forwards', pointerEvents: 'none',
      });
      if (!btn.style.position || btn.style.position === 'static') btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);
    });
  });
  if (!document.getElementById('ripple-style')) {
    const s = document.createElement('style');
    s.id = 'ripple-style';
    s.textContent = '@keyframes rippleOut { to { transform: scale(1); opacity: 0; } }';
    document.head.appendChild(s);
  }

  // ── Inject ambient blobs container if not present (used on every page) ──
  if (!document.querySelector('.ambient-blobs')) {
    const wrap = document.createElement('div');
    wrap.className = 'ambient-blobs';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `
      <div class="ambient-blob ambient-blob--1"></div>
      <div class="ambient-blob ambient-blob--2"></div>
      <div class="ambient-blob ambient-blob--3"></div>
    `;
    document.body.prepend(wrap);
  }

})();
