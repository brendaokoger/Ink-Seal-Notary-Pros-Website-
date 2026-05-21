(function () {
  'use strict';

  var header    = document.getElementById('site-header');
  var hamburger = document.getElementById('hamburger');
  var mobileNav = document.getElementById('mobile-nav');

  /* ---- Header scroll shadow ---- */
  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  function openMenu() {
    hamburger.classList.add('is-open');
    mobileNav.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileNav.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    hamburger.classList.remove('is-open');
    mobileNav.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.contains('is-open') ? closeMenu() : openMenu();
    });

    /* Close on any mobile link tap */
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    /* Close on outside click */
    document.addEventListener('click', function (e) {
      if (
        mobileNav.classList.contains('is-open') &&
        !mobileNav.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        closeMenu();
      }
    });

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
        closeMenu();
        hamburger.focus();
      }
    });
  }

  /* ---- Active nav link on scroll ---- */
  var sections = Array.from(document.querySelectorAll('section[id]'));
  var navLinks = Array.from(document.querySelectorAll('.nav-link'));
  var hh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 78;

  function setActiveNav() {
    var scrollY = window.scrollY;
    var current = '';
    sections.forEach(function (sec) {
      if (scrollY >= sec.offsetTop - hh - 30) current = sec.id;
    });
    navLinks.forEach(function (link) {
      var isActive = link.getAttribute('href') === '#' + current;
      link.classList.toggle('active', isActive);
    });
  }

  window.addEventListener('scroll', setActiveNav, { passive: true });
  setActiveNav();

})();
