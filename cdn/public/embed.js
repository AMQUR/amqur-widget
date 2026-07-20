/**
 * AMQUR production one-line embed loader.
 * Hosts are hardcoded for production only — no query-string or page-global API override.
 * @version 0221ff5d7d1087598b91e4d2b9facf478c425a9b @ 2026-07-20T03:17:29.711Z
 */
(function (window, document) {
  'use strict';

  var WIDGET_HOST = 'https://widget.dialusnow.com';
  var API_HOST = 'https://api.dialusnow.com';
  var API_BASE = API_HOST + '/api';
  var BUNDLE_URL = WIDGET_HOST + '/assistant-widget.iife.js';
  var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var BUNDLE_FLAG = '__AMQUR_WIDGET_BUNDLE_LOADING__';

  function fail(code) {
    try {
      console.error('[AMQUR] embed failed', { code: String(code).slice(0, 64) });
    } catch (_) {}
  }

  function findScript() {
    var cur = document.currentScript;
    if (
      cur &&
      cur.tagName === 'SCRIPT' &&
      cur.getAttribute('data-tenant')
    ) {
      return cur;
    }
    return document.querySelector('script[src*="embed.js"][data-tenant]');
  }

  function isValidSlug(value) {
    return typeof value === 'string' && SLUG_RE.test(value);
  }

  function readConfig(script) {
    var tenantSlug = (script.getAttribute('data-tenant') || '').trim().toLowerCase();
    var locationSlug = (script.getAttribute('data-location') || 'main').trim().toLowerCase();
    var locale = (script.getAttribute('data-locale') || 'en').trim().toLowerCase() || 'en';

    if (!locationSlug) locationSlug = 'main';
    if (!locale) locale = 'en';

    if (!isValidSlug(tenantSlug)) {
      fail('invalid_tenant');
      return null;
    }
    if (!isValidSlug(locationSlug)) {
      fail('invalid_location');
      return null;
    }

    return {
      tenantSlug: tenantSlug,
      locationSlug: locationSlug,
      locale: locale,
    };
  }

  function loadBundleOnce() {
    if (window.AMQUR && typeof window.AMQUR.init === 'function') {
      return Promise.resolve();
    }
    if (window[BUNDLE_FLAG]) {
      return window[BUNDLE_FLAG];
    }

    window[BUNDLE_FLAG] = new Promise(function (resolve, reject) {
      var existing = document.querySelector(
        'script[src="' + BUNDLE_URL + '"],script[src*="assistant-widget.iife.js"]',
      );
      if (existing) {
        if (window.AMQUR && typeof window.AMQUR.init === 'function') {
          resolve();
          return;
        }
        existing.addEventListener('load', function () {
          resolve();
        });
        existing.addEventListener('error', function () {
          reject(new Error('bundle_load_failed'));
        });
        return;
      }

      var s = document.createElement('script');
      s.async = true;
      s.defer = true;
      s.src = BUNDLE_URL;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('bundle_load_failed'));
      };
      document.head.appendChild(s);
    });

    return window[BUNDLE_FLAG];
  }

  function destroy() {
    try {
      if (window.AMQUR && typeof window.AMQUR.destroy === 'function') {
        window.AMQUR.destroy();
      }
    } catch (_) {}
    window.__AMQUR_EMBED_BOOTSTRAPPED__ = false;
  }

  function boot() {
    if (window.__AMQUR_EMBED_BOOTSTRAPPED__) {
      return;
    }

    var script = findScript();
    if (!script) {
      fail('script_not_found');
      return;
    }

    var cfg = readConfig(script);
    if (!cfg) return;

    window.__AMQUR_EMBED_BOOTSTRAPPED__ = true;

    loadBundleOnce()
      .then(function () {
        if (!window.AMQUR || typeof window.AMQUR.init !== 'function') {
          throw new Error('api_missing');
        }
        return window.AMQUR.init({
          apiBaseUrl: API_BASE,
          tenantSlug: cfg.tenantSlug,
          locationSlug: cfg.locationSlug,
          locale: cfg.locale,
        });
      })
      .catch(function (err) {
        window.__AMQUR_EMBED_BOOTSTRAPPED__ = false;
        fail((err && err.message) || 'bootstrap_failed');
      });
  }

  window.AMQUR_EMBED = {
    destroy: destroy,
    version: '0221ff5d7d1087598b91e4d2b9facf478c425a9b',
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window, document);
