(function () {
  'use strict';

  var header = document.getElementById('header');
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');

  /* scroll shadow */
  if (header && !header.classList.contains('form-hdr')) {
    function onScroll() {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

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

  /* active nav on scroll */
  var sections = Array.from(document.querySelectorAll('section[id]'));
  var navLinks  = Array.from(document.querySelectorAll('.nav-link'));
  var hh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 96;

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

  /* FAQ accordion */
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = this.closest('.faq-item');
      var list = this.closest('.faq-list');
      var isOpen = item.classList.contains('open');
      list.querySelectorAll('.faq-item').forEach(function (i) {
        i.classList.remove('open');
        i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        this.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* Scroll-reveal via IntersectionObserver */
  if (window.IntersectionObserver) {
    var revealSels = [
      '.sec-label', '.h-section', '.section-lead',
      '.service-card', '.feat-item', '.process-step',
      '.on-info-card', '.contact-block',
      '.faq-item'
    ];
    var revealEls = Array.from(document.querySelectorAll(revealSels.join(',')));
    if (revealEls.length) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('r-vis');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });

      revealEls.forEach(function (el) {
        /* stagger siblings of same type within same parent */
        var cls = el.classList[0];
        var siblings = Array.from(el.parentElement.children).filter(function (c) {
          return c.classList.contains(cls);
        });
        var idx = siblings.indexOf(el);
        if (idx > 0) el.style.transitionDelay = Math.min(idx * 0.11, 0.38) + 's';
        el.classList.add('r-wait');
        obs.observe(el);
      });
    }
  }

}());
