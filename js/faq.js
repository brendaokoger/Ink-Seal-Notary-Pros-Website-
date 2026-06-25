/* Ink & Seal — FAQ accordion */

(function () {
  'use strict';

  var items = document.querySelectorAll('.faq-item');

  items.forEach(function (item) {
    var btn    = item.querySelector('.faq-question');
    var answer = item.querySelector('.faq-answer');
    if (!btn || !answer) return;

    btn.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');

      /* Close all others */
      items.forEach(function (other) {
        if (other !== item) {
          other.classList.remove('open');
          var otherBtn    = other.querySelector('.faq-question');
          var otherAnswer = other.querySelector('.faq-answer');
          if (otherBtn)    otherBtn.setAttribute('aria-expanded', 'false');
          if (otherAnswer) otherAnswer.setAttribute('aria-hidden', 'true');
        }
      });

      if (isOpen) {
        item.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        answer.setAttribute('aria-hidden', 'true');
      } else {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        answer.setAttribute('aria-hidden', 'false');
      }
    });
  });

})();
