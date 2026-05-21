(function () {
  'use strict';

  var header = document.getElementById('header');
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');

  /* scroll shadow */
  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* mobile menu */
  function openMenu() {
    burger.classList.add('open');
    drawer.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    burger.classList.remove('open');
    drawer.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (burger && drawer) {
    burger.addEventListener('click', function () {
      burger.classList.contains('open') ? closeMenu() : openMenu();
    });
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', function (e) {
      if (drawer.classList.contains('open')
          && !drawer.contains(e.target)
          && !burger.contains(e.target)) { closeMenu(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenu(); burger.focus(); }
    });
  }

  /* active nav highlight on scroll */
  var sections = Array.from(document.querySelectorAll('section[id]'));
  var navLinks  = Array.from(document.querySelectorAll('.nav-link'));
  var hh = parseInt(getComputedStyle(document.documentElement)
                    .getPropertyValue('--hh')) || 90;

  function updateNav() {
    var y = window.scrollY, id = '';
    sections.forEach(function (s) {
      if (y >= s.offsetTop - hh - 40) id = s.id;
    });
    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + id);
    });
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
}());
