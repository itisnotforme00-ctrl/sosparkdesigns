/* ============================================
   SoSpark Design v3 — Margin Rail (Step 2 redesign, piece 2/7)
   Injects the rail markup on load (same pattern as the old ambient-blobs
   injection this replaces), then drives three genuinely dynamic things:
   1. Section index — built from real <section id> + heading text already
      on the page, not invented labels.
   2. Scroll-position tick — real scroll math against document height.
   3. Active-section highlight — IntersectionObserver, same technique
      already used by services.html's own scroll-spy.

   The spec block (swatch + hex + typeface) is currently STATIC — it
   always reads --spark / #2563EB / "Fraunces / DM Sans", because no
   section has a differentiated color identity yet (that's what the
   Portfolio and About pieces will introduce, e.g. the ink/paper two-tone
   per case study). Once those land, this block should read genuinely
   different values per section; wiring that up now would mean inventing
   per-section colors that don't exist in the design yet, so it's left
   honestly static until there's real data to reflect.
   ============================================ */
(function () {
  'use strict';

  const SECTION_SELECTOR = 'main > section';

  function buildLabel(section) {
    const heading = section.querySelector('h1, h2');
    if (heading) {
      // innerText (not textContent) so a <br> inside a multi-line headline
      // becomes a real line break — and therefore a space once collapsed
      // below — instead of two words silently running together.
      const text = heading.innerText || heading.textContent || '';
      if (text.trim()) {
        return text.trim().replace(/\s+/g, ' ').split(' ').slice(0, 3).join(' ');
      }
    }
    const ariaLabel = section.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.split(' ').slice(0, 3).join(' ');
    const labelledBy = section.getAttribute('aria-labelledby');
    if (labelledBy) {
      const target = document.getElementById(labelledBy);
      if (target && target.textContent.trim()) {
        return target.textContent.trim().replace(/\s+/g, ' ').split(' ').slice(0, 3).join(' ');
      }
    }
    if (section.id) return section.id.replace(/-/g, ' ');
    const firstClass = (section.className || '').toString().split(' ')[0];
    return firstClass ? firstClass.replace(/-/g, ' ') : 'Section';
  }

  function init() {
    const sections = Array.from(document.querySelectorAll(SECTION_SELECTOR));

    const rail = document.createElement('div');
    rail.className = 'margin-rail';
    rail.setAttribute('aria-hidden', 'true');
    rail.innerHTML = `
      <div class="margin-rail__mark">SoSpark</div>
      <div class="margin-rail__index"></div>
      <div class="margin-rail__track-wrap"><div class="margin-rail__track-fill"></div></div>
      <div class="margin-rail__spec">
        <div class="margin-rail__swatch"></div>
        <div class="margin-rail__hex">#2563EB</div>
        <div class="margin-rail__font">Fraunces / DM Sans</div>
      </div>
    `;
    document.body.prepend(rail);

    const chip = document.createElement('div');
    chip.className = 'margin-rail__mobile-chip';
    chip.setAttribute('aria-hidden', 'true');
    chip.innerHTML = '<span class="margin-rail__mobile-chip-dot"></span><span class="margin-rail__mobile-chip-label"></span>';
    document.body.appendChild(chip);

    const indexEl = rail.querySelector('.margin-rail__index');
    const chipLabel = chip.querySelector('.margin-rail__mobile-chip-label');
    const fill = rail.querySelector('.margin-rail__track-fill');

    const items = sections.map((section, i) => {
      const el = document.createElement('div');
      el.className = 'margin-rail__index-item';
      el.textContent = String(i + 1).padStart(2, '0') + ' \u2014 ' + buildLabel(section);
      indexEl.appendChild(el);
      return el;
    });

    let activeIndex = -1;
    function setActive(i) {
      if (i === activeIndex) return;
      items.forEach((el, idx) => el.classList.toggle('is-active', idx === i));
      activeIndex = i;
      const label = sections[i] ? buildLabel(sections[i]) : '';
      chipLabel.textContent = sections[i] ? String(i + 1).padStart(2, '0') + ' ' + label : '';
    }
    if (sections.length) setActive(0);

    if (sections.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = sections.indexOf(entry.target);
            if (idx !== -1) setActive(idx);
          }
        });
      }, { threshold: 0, rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(s => io.observe(s));
    }

    let ticking = false;
    function updateScrollTick() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      fill.style.height = (pct * 100) + '%';
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(updateScrollTick); ticking = true; }
    }, { passive: true });
    updateScrollTick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
