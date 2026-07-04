/* ============================================
   SoSpark Design v3 — Detail View (R4 / R5)
   Fixes the "clicking a portfolio image / team member does nothing" bugs.
   Sources content from markup already on the page (case-study sections,
   team-card fields) rather than an API call, since the confirmed
   /api/portfolio field-name mapping hasn't been provided yet — this can be
   swapped to fetch live data later without changing the modal itself.
   ============================================ */
(function () {
  'use strict';

  let modalEl = null;
  let lastFocused = null;

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.className = 'detail-modal';
    modalEl.id = 'detail-modal';
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="detail-modal__backdrop" data-close></div>
      <div class="detail-modal__panel" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
        <button class="detail-modal__close" data-close aria-label="Close">&times;</button>
        <div class="detail-modal__body"></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', e => {
      if (e.target.hasAttribute('data-close')) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modalEl.hidden) closeModal();
    });
    return modalEl;
  }

  function openModal(bodyHTML, triggerEl) {
    const modal = ensureModal();
    modal.querySelector('.detail-modal__body').innerHTML = bodyHTML;
    lastFocused = triggerEl || document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.detail-modal__close').focus();
  }

  function closeModal() {
    if (!modalEl || modalEl.hidden) return;
    modalEl.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── R4: Portfolio case-study click-through ──
  // Each .pf-card already links to a #slug anchor pointing at a matching
  // .case-study section with the full write-up — that section is the
  // single source of truth for modal content, so nothing is duplicated.
  const pfCards = document.querySelectorAll('.pf-card[href^="#"]');
  pfCards.forEach(card => {
    card.addEventListener('click', e => {
      const id = card.getAttribute('href').slice(1);
      const source = document.getElementById(id);
      if (!source) return; // fall back to the normal anchor jump
      e.preventDefault();

      const tag = source.querySelector('.case-study__tag')?.textContent || '';
      const title = source.querySelector('.case-study__title')?.textContent || '';
      const desc = source.querySelector('.case-study__desc')?.innerHTML || '';
      const metaItems = Array.from(source.querySelectorAll('.case-study__meta-item')).map(item => {
        const dt = item.querySelector('dt')?.textContent || '';
        const dd = item.querySelector('dd')?.textContent || '';
        return `<div class="detail-modal__meta-item"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`;
      }).join('');

      openModal(`
        <div class="detail-modal__tag">${esc(tag)}</div>
        <h2 class="detail-modal__title" id="detail-modal-title">${esc(title)}</h2>
        <p class="detail-modal__desc">${desc}</p>
        <dl class="detail-modal__meta">${metaItems}</dl>
      `, card);
    });
  });

  // ── R5: Team profile click-through ──
  // Cards had no click target at all before. Made keyboard-accessible
  // (role="button", tabindex, Enter/Space) as well as click/tap.
  const teamCards = document.querySelectorAll('.team-card');
  teamCards.forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.style.cursor = 'pointer';
    const name = card.querySelector('.team-card__name')?.textContent || '';
    card.setAttribute('aria-label', `View ${name}'s profile`);

    function open() {
      const role = card.querySelector('.team-card__role')?.textContent || '';
      const bio = card.querySelector('.team-card__bio')?.textContent || '';
      const initials = card.querySelector('.team-card__initials')?.textContent || '';
      const socialLinks = Array.from(card.querySelectorAll('.team-card__social-link')).map(a => a.outerHTML).join('');

      openModal(`
        <div class="detail-modal__avatar">${esc(initials)}</div>
        <div class="detail-modal__tag">${esc(role)}</div>
        <h2 class="detail-modal__title" id="detail-modal-title">${esc(name)}</h2>
        <p class="detail-modal__desc">${esc(bio)}</p>
        <div class="detail-modal__socials">${socialLinks}</div>
      `, card);
    }

    card.addEventListener('click', e => {
      // Don't hijack clicks on the actual social icon links inside the card.
      if (e.target.closest('.team-card__social-link')) return;
      open();
    });
    card.addEventListener('keydown', e => {
      if (e.target.closest('.team-card__social-link')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

})();
