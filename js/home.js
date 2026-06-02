(function () {
  'use strict';

  /* ── Footer year ─────────────────────────────────────── */
  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  if (!window.IntersectionObserver) return;

  /* ── Count-up for .feat-num[data-target] ──────────────── */
  var counters = Array.from(document.querySelectorAll('.feat-num[data-target]'));

  if (counters.length) {
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-target'), 10);
        if (isNaN(target)) return;
        var duration = 1600;
        var start = null;

        function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

        function tick(ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          el.textContent = Math.round(easeOut(progress) * target);
          if (progress < 1) {
            requestAnimationFrame(tick);
          } else {
            el.textContent = target;
          }
        }

        requestAnimationFrame(tick);
        countIO.unobserve(el);
      });
    }, { threshold: 0.6 });

    counters.forEach(function (el) { countIO.observe(el); });
  }

  /* ── Scroll-reveal for doc-card and mistake-item ─────── */
  var revealEls = Array.from(document.querySelectorAll('.doc-card, .mistake-item'));

  if (revealEls.length) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('r-vis');
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

    revealEls.forEach(function (el) {
      var cls = el.classList[0];
      var siblings = Array.from(el.parentElement.children).filter(function (c) {
        return c.classList.contains(cls);
      });
      var idx = siblings.indexOf(el);
      if (idx > 0) el.style.transitionDelay = Math.min(idx * 0.07, 0.42) + 's';
      el.classList.add('r-wait');
      revealIO.observe(el);
    });
  }

}());
