/*
  Анимация при прокрутке без библиотек: заранее нарезанные кадры рисуются на холсте,
  номер кадра зависит от положения прокрутки.

  Разметка:
    <section class="mgen-scroll" data-frames="frames/frame-$.jpg" data-count="120">
      <div class="mgen-scroll__sticky">
        <canvas class="mgen-scroll__canvas"></canvas>
        <img class="mgen-scroll__fallback" src="frames/frame-0001.jpg" alt="">
      </div>
    </section>

  В data-frames знак $ заменяется номером кадра с ведущими нулями (data-pad, по умолчанию 4).
  Кадры делает «mgen frames видео.mp4».
*/
(function () {
  'use strict';

  var MOBILE = '(max-width: 767px)';
  var REDUCED = '(prefers-reduced-motion: reduce)';

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function framePath(pattern, index, pad) {
    var number = String(index + 1);
    while (number.length < pad) number = '0' + number;
    return pattern.replace('$', number);
  }

  function ScrollFrames(section) {
    var canvas = section.querySelector('.mgen-scroll__canvas');
    var pattern = section.getAttribute('data-frames');
    var count = parseInt(section.getAttribute('data-count'), 10) || 0;
    var pad = parseInt(section.getAttribute('data-pad'), 10) || 4;
    if (!canvas || !pattern || count < 2) return;

    var context = canvas.getContext('2d', { alpha: false });
    var images = new Array(count);
    var loaded = new Array(count);
    var current = -1;
    var ticking = false;
    var inView = true;

    // Сколько картинок тянем одновременно: больше — быстрее, но тяжелее для страницы.
    var PARALLEL = 6;
    var queue = buildQueue();
    var active = 0;

    // Сначала редкие кадры по всей длине, чтобы прокрутка сразу что-то показывала,
    // потом всё остальное по порядку.
    function buildQueue() {
      var order = [];
      var seen = {};
      var stride = Math.max(1, Math.floor(count / 12));
      for (var i = 0; i < count; i += stride) {
        order.push(i);
        seen[i] = true;
      }
      for (var j = 0; j < count; j += 1) if (!seen[j]) order.push(j);
      return order;
    }

    function pump() {
      while (active < PARALLEL && queue.length) {
        var index = queue.shift();
        if (loaded[index]) continue;
        active += 1;
        load(index);
      }
    }

    function load(index) {
      var image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        images[index] = image;
        loaded[index] = true;
        active -= 1;
        if (current === -1 || index === current) draw(index);
        if (!section.classList.contains('is-ready')) section.classList.add('is-ready');
        pump();
      };
      image.onerror = function () {
        active -= 1;
        pump();
      };
      image.src = framePath(pattern, index, pad);
    }

    function nearestLoaded(index) {
      if (loaded[index]) return index;
      for (var step = 1; step < count; step += 1) {
        if (index - step >= 0 && loaded[index - step]) return index - step;
        if (index + step < count && loaded[index + step]) return index + step;
      }
      return -1;
    }

    function resize() {
      var box = canvas.getBoundingClientRect();
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      var width = Math.round(box.width * ratio);
      var height = Math.round(box.height * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        if (current >= 0) draw(current, true);
      }
    }

    // Рисуем кадр «по размеру холста», как object-fit: cover.
    function draw(index, force) {
      var source = nearestLoaded(index);
      if (source === -1) return;
      if (!force && source === current) return;
      current = source;
      var image = images[source];
      var scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      var width = image.width * scale;
      var height = image.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }

    function update() {
      ticking = false;
      if (!inView) return;
      var rect = section.getBoundingClientRect();
      var travel = section.offsetHeight - window.innerHeight;
      var progress = travel > 0 ? clamp(-rect.top / travel, 0, 1) : 0;
      draw(Math.round(progress * (count - 1)));
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    if (window.IntersectionObserver) {
      new window.IntersectionObserver(
        function (entries) {
          inView = entries[0].isIntersecting;
          if (inView) onScroll();
        },
        { rootMargin: '200px' },
      ).observe(section);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      resize();
      onScroll();
    });

    // Небольшая ручка наружу: удобно для отладки и проверки страницы.
    section.mgenScroll = {
      update: update,
      redraw: function () {
        resize();
        if (current >= 0) draw(current, true);
      },
      frameCount: count,
      currentFrame: function () {
        return current;
      },
      loadedCount: function () {
        var total = 0;
        for (var i = 0; i < count; i += 1) if (loaded[i]) total += 1;
        return total;
      },
    };

    resize();
    pump();
    onScroll();
  }

  function start() {
    // Телефон и «уменьшить движение»: показываем статичный кадр, кадры не грузим вовсе.
    var still =
      window.matchMedia &&
      (window.matchMedia(REDUCED).matches || window.matchMedia(MOBILE).matches);

    var sections = document.querySelectorAll('.mgen-scroll');
    for (var i = 0; i < sections.length; i += 1) {
      if (still) sections[i].classList.remove('is-ready');
      else ScrollFrames(sections[i]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
