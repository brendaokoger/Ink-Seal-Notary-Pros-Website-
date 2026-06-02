/* Ink & Seal — Homepage: animated stat counters + footer year */

(function () {
  'use strict';

  /* --- Footer year --- */
  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* --- Stat counter animation --- */
  var statNumbers = document.querySelectorAll('.stat-number[data-target]');
  if (!statNumbers.length) return;

  function animateCounter(el) {
    var target   = parseInt(el.getAttribute('data-target'), 10);
    var duration = 1800;
    var start    = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString();
    }

    requestAnimationFrame(step);
  }

  var observed = new Set();

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && !observed.has(entry.target)) {
        observed.add(entry.target);
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.3 });

  statNumbers.forEach(function (el) {
    observer.observe(el);
  });

})();
