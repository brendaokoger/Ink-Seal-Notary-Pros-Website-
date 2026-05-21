(function () {
  'use strict';

  var header    = document.getElementById('site-header');
  var hamburger = document.getElementById('hamburger');
  var mobileNav = document.getElementById('mobile-nav');

  /* Scroll shadow on header */
  function handleScroll() {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  /* Hamburger toggle */
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
    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', function (e) {
      if (
        mobileNav.classList.contains('is-open') &&
        !mobileNav.contains(e.target) &&
        !hamburger.contains(e.target)
      ) { closeMenu(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
        closeMenu();
        hamburger.focus();
      }
    });
  }

  /* Active nav link tracking */
  var sections = Array.from(document.querySelectorAll('section[id]'));
  var navLinks = Array.from(document.querySelectorAll('.nav-link'));
  var hh = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--hh')
  ) || 88;

  function updateActive() {
    var y = window.scrollY;
    var current = sections.reduce(function (acc, sec) {
      return y >= sec.offsetTop - hh - 40 ? sec.id : acc;
    }, sections[0] ? sections[0].id : '');
    navLinks.forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', updateActive, { passive: true });
  updateActive();

}());
