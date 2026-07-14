/**
 * AMQUR Jeep of Chicago canary loader — shared core for GTM Custom HTML.
 * Hosts must be replaced only with provisioned production values.
 * Never embed secrets. Never use staging fixture inventory on public pages.
 */
(function (window, document) {
  'use strict';

  var CFG = window.__AMQUR_CANARY_CFG__ || {};
  var ALLOWED_HOSTS = CFG.allowedHosts || [
    'www.jeepofchicago.com',
    'jeepofchicago.com',
  ];
  var MODE = CFG.mode || 'disabled'; // disabled | employee | canary | full
  var PERCENT = typeof CFG.percent === 'number' ? CFG.percent : 0;
  var API_BASE = CFG.apiBaseUrl || '';
  var ASSET_URL = CFG.assetUrl || '';
  var TENANT = 'dial-auto-group';
  var LOCATION = 'jeep-of-chicago';
  var KILL_QS = 'amqur_canary_kill';
  var EMP_QS = 'amqur_employee';
  var EMP_COOKIE = 'amqur_emp';
  var BUCKET_KEY = 'amqur_canary_bucket_v1';

  function log(level, event, detail) {
    try {
      var payload = { src: 'amqur-canary', event: event, mode: MODE, t: Date.now() };
      if (detail && typeof detail === 'object') {
        // never attach message content / PII
        if (detail.code) payload.code = String(detail.code).slice(0, 64);
      }
      if (level === 'error') console.error('[AMQUR]', event, payload);
      else console.info('[AMQUR]', event, payload);
      window.dispatchEvent(new CustomEvent('amqur:diag', { detail: payload }));
    } catch (_) {}
  }

  function hostAllowed() {
    var h = (location.hostname || '').toLowerCase();
    return ALLOWED_HOSTS.indexOf(h) !== -1;
  }

  function qs(name) {
    try {
      return new URLSearchParams(location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  function killSwitch() {
    if (qs(KILL_QS) === '1') return true;
    try {
      if (localStorage.getItem(KILL_QS) === '1') return true;
    } catch (_) {}
    return false;
  }

  function cookieHas(name) {
    try {
      return document.cookie.split(';').some(function (c) {
        return c.trim().indexOf(name + '=1') === 0;
      });
    } catch (_) {
      return false;
    }
  }

  /** Employee gate: requires cookie set by authenticated test page OR one-time hashed token check via CFG.employeeTokenHash */
  function employeeAllowed() {
    if (cookieHas(EMP_COOKIE)) return true;
    var token = qs(EMP_QS);
    if (!token || !CFG.employeeTokenHash) return false;
    // Compare SHA-256 hex of token to configured hash (no plaintext secret in snippet).
    return sha256Hex(token).then(function (hex) {
      return hex === String(CFG.employeeTokenHash).toLowerCase();
    });
  }

  function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.resolve('');
    }
    var data = new TextEncoder().encode(text);
    return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) {
          return b.toString(16).padStart(2, '0');
        })
        .join('');
    });
  }

  function stableBucket() {
    try {
      var existing = localStorage.getItem(BUCKET_KEY);
      if (existing && /^\d+$/.test(existing)) return Number(existing);
      var n = Math.floor(Math.random() * 10000);
      localStorage.setItem(BUCKET_KEY, String(n));
      return n;
    } catch (_) {
      return Math.floor(Math.random() * 10000);
    }
  }

  function inPercent(p) {
    if (p <= 0) return false;
    if (p >= 100) return true;
    return stableBucket() % 10000 < Math.floor(p * 100);
  }

  function validateConfig() {
    if (!API_BASE || !ASSET_URL) {
      log('error', 'missing_hosts', { code: 'HOSTS_BLOCKED' });
      return false;
    }
    if (/localhost|127\.0\.0\.1|example\.com|INSERT_|YOUR_|personal|github\.io/i.test(API_BASE + ASSET_URL)) {
      log('error', 'forbidden_host_pattern', { code: 'HOST_PATTERN' });
      return false;
    }
    if (!/^https:\/\//i.test(API_BASE) || !/^https:\/\//i.test(ASSET_URL)) {
      log('error', 'https_required', { code: 'HTTPS' });
      return false;
    }
    return true;
  }

  function destroy() {
    try {
      if (window.AMQUR && typeof window.AMQUR.destroy === 'function') {
        window.AMQUR.destroy();
      }
    } catch (_) {}
    window.__AMQUR_CANARY_BOOTSTRAPPED__ = false;
    log('info', 'destroyed');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.async = true;
      s.src = src;
      if (CFG.sri) {
        s.integrity = CFG.sri;
        s.crossOrigin = 'anonymous';
      }
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('asset_load_failed'));
      };
      document.head.appendChild(s);
    });
  }

  async function initWidget() {
    if (!window.AMQUR || typeof window.AMQUR.init !== 'function') {
      throw new Error('api_missing');
    }
    await window.AMQUR.init({
      apiBaseUrl: API_BASE.replace(/\/$/, '') + ( /\/api$/i.test(API_BASE) ? '' : '/api' ),
      tenantSlug: TENANT,
      locationSlug: LOCATION,
      locale: 'en',
    });
    log('info', 'initialized');
  }

  async function maybeStart() {
    if (window.__AMQUR_CANARY_BOOTSTRAPPED__) {
      log('info', 'duplicate_blocked');
      return;
    }
    if (killSwitch()) {
      log('info', 'kill_switch');
      destroy();
      return;
    }
    if (!hostAllowed()) {
      log('error', 'hostname_rejected', { code: 'HOST' });
      return;
    }
    if (MODE === 'disabled') {
      log('info', 'mode_disabled');
      return;
    }
    if (!validateConfig()) return;

    if (MODE === 'employee') {
      var ok = await employeeAllowed();
      if (!ok) {
        log('info', 'employee_gate_denied');
        return;
      }
    } else if (MODE === 'canary') {
      if (!inPercent(PERCENT)) {
        log('info', 'canary_bucket_miss');
        return;
      }
    } else if (MODE !== 'full') {
      log('error', 'unknown_mode', { code: 'MODE' });
      return;
    }

    // Optional CMP hook: set CFG.requireConsent=true and listen for amqur:consent-granted
    if (CFG.requireConsent && !window.__AMQUR_CONSENT_GRANTED__) {
      log('info', 'awaiting_consent');
      window.addEventListener(
        'amqur:consent-granted',
        function () {
          window.__AMQUR_CONSENT_GRANTED__ = true;
          maybeStart();
        },
        { once: true },
      );
      return;
    }

    window.__AMQUR_CANARY_BOOTSTRAPPED__ = true;
    try {
      await loadScript(ASSET_URL);
      await initWidget();
    } catch (e) {
      window.__AMQUR_CANARY_BOOTSTRAPPED__ = false;
      log('error', 'bootstrap_failed', { code: (e && e.message) || 'fail' });
    }
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // SPA soft support: re-check kill switch on history changes; do not double-init.
  function bindSpa() {
    var wrap = function (type) {
      var orig = history[type];
      if (typeof orig !== 'function') return;
      history[type] = function () {
        var ret = orig.apply(this, arguments);
        window.dispatchEvent(new Event('amqur:nav'));
        return ret;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', function () {
      window.dispatchEvent(new Event('amqur:nav'));
    });
    window.addEventListener('amqur:nav', function () {
      if (killSwitch()) destroy();
    });
  }

  window.AMQUR_CANARY = {
    start: maybeStart,
    destroy: destroy,
    mode: function () {
      return MODE;
    },
  };

  onReady(function () {
    bindSpa();
    maybeStart();
  });
})(window, document);
