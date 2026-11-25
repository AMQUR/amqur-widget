/**
 * Private owner preview page.
 *
 * Boots the assistant inline for the chosen store through the widget's public API
 * (AMQUR.destroy / AMQUR.init / AMQUR.isReady / AMQUR.send) and shows a designed
 * connecting / could-not-connect state around it. Configuration comes only from attributes the
 * build stamps on <html>; nothing is read from the URL, and nothing here is a secret.
 */
(function (window, document) {
  'use strict';

  var CONNECT_TIMEOUT_MS = 25000;
  var STORE_DEBOUNCE_MS = 220;

  var root = document.documentElement;
  var apiOrigin = root.getAttribute('data-amqur-api-origin') || '';
  var consoleEl = document.getElementById('assistant');
  var stateEl = document.getElementById('assistant-state');
  var mountEl = document.getElementById('assistant-mount');
  var barName = document.getElementById('assistant-state-store');
  var titleEl = document.getElementById('assistant-state-title');
  var detailEl = document.getElementById('assistant-state-detail');
  var retryBtn = document.getElementById('assistant-retry');
  var hintEl = document.getElementById('chip-hint');
  var jumpEl = document.getElementById('assistant-jump');
  var jumpStore = document.getElementById('assistant-jump-store');
  var radios = Array.prototype.slice.call(document.querySelectorAll('input[name="store"]'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip[data-prompt]'));

  if (!consoleEl || !stateEl || !mountEl || !retryBtn || radios.length === 0) return;

  var attempt = 0;
  var debounce = null;
  var hintTimer = null;

  function selected() {
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) return radios[i];
    }
    return radios[0];
  }

  function storeName(radio) {
    return radio.getAttribute('data-name') || radio.value;
  }

  function widget() {
    var api = window.AMQUR;
    return api && typeof api.init === 'function' && typeof api.destroy === 'function' ? api : null;
  }

  function setChips(enabled) {
    for (var i = 0; i < chips.length; i++) {
      if (enabled) chips[i].removeAttribute('aria-disabled');
      else chips[i].setAttribute('aria-disabled', 'true');
    }
  }

  function hint(text, persist) {
    if (!hintEl) return;
    window.clearTimeout(hintTimer);
    hintEl.textContent = text;
    if (text && !persist) {
      hintTimer = window.setTimeout(function () {
        hintEl.textContent = '';
      }, 6000);
    }
  }

  /** state: connecting | ready | error | unavailable */
  function show(state, name) {
    consoleEl.setAttribute('data-state', state === 'unavailable' ? 'error' : state);
    consoleEl.setAttribute('data-store', selected().value);
    var ready = state === 'ready';
    stateEl.hidden = ready;
    mountEl.hidden = !ready;
    setChips(ready);
    if (jumpStore) jumpStore.textContent = name;
    if (ready) {
      hint('');
      return;
    }
    barName.textContent = name;
    if (state === 'connecting') {
      titleEl.textContent = 'Connecting to ' + name + '…';
      detailEl.textContent = 'This takes a moment.';
      retryBtn.hidden = true;
    } else if (state === 'unavailable') {
      titleEl.textContent = 'The assistant didn’t load';
      detailEl.textContent = 'Reload this page to try again.';
      retryBtn.textContent = 'Reload';
      retryBtn.hidden = false;
    } else {
      titleEl.textContent = 'Couldn’t connect';
      detailEl.textContent =
        'The assistant for ' + name + ' didn’t answer, so nothing was sent. Try again, or choose another store.';
      retryBtn.textContent = 'Try again';
      retryBtn.hidden = false;
    }
  }

  function boot() {
    var mine = ++attempt;
    var radio = selected();
    var name = storeName(radio);
    var api = widget();

    if (!api || !/^https:\/\/[a-z0-9.-]+$/.test(apiOrigin)) {
      show('unavailable', name);
      return;
    }

    try {
      api.destroy();
    } catch (_) {}
    show('connecting', name);

    var settled = false;
    function finish(ok) {
      if (settled || mine !== attempt) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok) {
        show('ready', name);
        return;
      }
      try {
        api.destroy();
      } catch (_) {}
      show('error', name);
    }

    var timer = window.setTimeout(function () {
      finish(false);
    }, CONNECT_TIMEOUT_MS);

    var started;
    try {
      started = api.init({
        apiBaseUrl: apiOrigin + '/api',
        tenantSlug: radio.value,
        locationSlug: 'main',
        locale: 'en',
        theme: 'showroom',
        display: 'inline',
        container: mountEl,
      });
    } catch (_) {
      finish(false);
      return;
    }
    Promise.resolve(started).then(
      function () {
        finish(typeof api.isReady === 'function' && api.isReady() === true);
      },
      function () {
        finish(false);
      }
    );
  }

  function singleColumn() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches;
  }

  function revealConsole() {
    if (!singleColumn()) return;
    var calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      consoleEl.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    } catch (_) {
      consoleEl.scrollIntoView();
    }
  }

  function copyText(text) {
    if (window.navigator.clipboard && typeof window.navigator.clipboard.writeText === 'function') {
      return window.navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return false;
        }
      );
    }
    return Promise.resolve(false);
  }

  function onChip(event) {
    var chip = event.currentTarget;
    var prompt = chip.getAttribute('data-prompt') || '';
    if (!prompt) return;
    var api = widget();
    if (chip.getAttribute('aria-disabled') === 'true' || !api || !api.isReady || !api.isReady()) {
      hint('Examples can be sent once the assistant is connected.');
      return;
    }
    if (typeof api.send === 'function' && api.send(prompt) === true) {
      hint('Sent to the assistant: “' + prompt + '”');
      revealConsole();
      return;
    }
    // Older widget bundle without a send API: hand the text over for pasting instead.
    copyText(prompt).then(function (copied) {
      hint(copied ? 'Copied. Paste it into the chat.' : 'Type it into the chat: “' + prompt + '”', !copied);
      revealConsole();
    });
  }

  for (var r = 0; r < radios.length; r++) {
    radios[r].addEventListener('change', function () {
      // Arrow keys walk through the stores; connect once the choice settles.
      window.clearTimeout(debounce);
      show('connecting', storeName(selected()));
      attempt += 1;
      try {
        var api = widget();
        if (api) api.destroy();
      } catch (_) {}
      debounce = window.setTimeout(boot, STORE_DEBOUNCE_MS);
    });
  }
  for (var c = 0; c < chips.length; c++) chips[c].addEventListener('click', onChip);

  retryBtn.addEventListener('click', function () {
    if (!widget()) {
      window.location.reload();
      return;
    }
    boot();
    // The button hides while connecting; keep keyboard focus inside the console.
    try {
      consoleEl.focus({ preventScroll: true });
    } catch (_) {
      consoleEl.focus();
    }
  });

  // Phones and tablets: offer a way down to the chat while it is off screen.
  if (jumpEl && typeof window.IntersectionObserver === 'function') {
    new window.IntersectionObserver(
      function (entries) {
        jumpEl.hidden = entries[entries.length - 1].isIntersecting;
      },
      { threshold: 0.12 }
    ).observe(consoleEl);
  }

  window.addEventListener('pageshow', function (event) {
    // Restored from the back/forward cache: the widget was torn down, connect again.
    if (event.persisted) boot();
  });

  boot();
})(window, document);
