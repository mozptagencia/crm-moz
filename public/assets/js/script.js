/* ============================================================
   MOZ · NAV.JS
   Navegação âncora com estado activo por scroll
   ============================================================ */

(function () {
  'use strict';

  const nav     = document.querySelector('.nav__links');
  if (!nav) return;

  const links   = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const targets = links.map(l => document.querySelector(l.getAttribute('href'))).filter(Boolean);

  // Marcar link activo com base na secção visível
  function onScroll() {
    const scrollY = window.scrollY + 120;
    let current = targets[0];

    for (const el of targets) {
      if (el.offsetTop <= scrollY) current = el;
    }

    links.forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === '#' + current.id);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Smooth scroll ao clicar (fallback para browsers sem suporte nativo)
  links.forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
