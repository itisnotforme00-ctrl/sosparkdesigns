(function () {
  'use strict';
  const nav = document.querySelector('.nav');
  const hamburger = document.querySelector('.nav__hamburger');
  const mobileMenu = document.querySelector('.nav__mobile');

  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      const open = hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      hamburger.setAttribute('aria-expanded', open);
    });
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    if (link.getAttribute('href') === current) link.classList.add('active');
  });
})();
