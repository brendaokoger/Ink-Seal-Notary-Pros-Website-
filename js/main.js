/* Ink & Seal Notary Pros — Header + Hero interactions */

(function () {
  'use strict';

  const header    = document.getElementById('site-header');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');
  const mobileLinks = mobileNav ? mobileNav.querySelectorAll('.mobile-nav-link, .mobile-nav-cta') : [];

  /* --- Scroll: add .scrolled class to header --- */
  function onScroll() {
    if (window.scrollY > 12) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --- Mobile menu toggle --- */
  function openMenu() {
    hamburger.classList.add('open');
    mobileNav.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileNav.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    hamburger.classList.remove('open');
    mobileNav.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      if (hamburger.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    /* Close when a mobile link is tapped */
    mobileLinks.forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    /* Close on outside click */
    document.addEventListener('click', function (e) {
      if (
        mobileNav.classList.contains('open') &&
        !mobileNav.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        closeMenu();
      }
    });

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) {
        closeMenu();
        hamburger.focus();
      }
    });
  }

  /* --- Active nav link on scroll --- */
  const sections   = document.querySelectorAll('section[id]');
  const navLinks   = document.querySelectorAll('.nav-link');
  const headerH    = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 80;

  function updateActiveNav() {
    let current = '';
    sections.forEach(function (sec) {
      if (window.scrollY >= sec.offsetTop - headerH - 20) {
        current = sec.getAttribute('id');
      }
    });
    navLinks.forEach(function (link) {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();

})();
