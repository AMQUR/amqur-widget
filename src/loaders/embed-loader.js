/**
 * AMQUR production one-line embed loader.
 * Hosts are hardcoded for production only — no query-string or page-global API override.
 *
 * A host page can never choose which API this loader talks to. It may only state which API it
 * expects (data-expect-api-origin, e.g. the origin it allowed in its Content Security Policy).
 * If that does not equal the API baked into this build, the loader refuses to start: a staging
 * loader can never run against a page configured for production, or the other way round.
 * @version RELEASE_SHA @ BUILD_TIME
 */
(function (window, document) {
  'use strict';

  var WIDGET_HOST = 'https://widget.dialusnow.com';
  var API_HOST = 'https://api.dialusnow.com';
  var API_BASE = API_HOST + '/api';
  var BUNDLE_URL = WIDGET_HOST + '/assistant-widget.iife.js';
  var EMBED_ENV = 'production';
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

  /** scheme://host[:port] in canonical form, or null for anything that is not a plain origin. */
  function originOf(value) {
    try {
      var u = new URL(String(value).trim());
      if (u.username || u.password || u.search || u.hash) return null;
      if (u.pathname !== '/' && u.pathname !== '') return null;
      return u.origin;
    } catch (_) {
      return null;
    }
  }

  /**
   * True when the page states no expectation, or states exactly this build's API origin.
   * An expectation can only make the loader refuse; it is never used as the API address.
   */
  function expectationHolds(script) {
    var expected = script.getAttribute('data-expect-api-origin');
    if (expected === null || expected === '') return true;
    return originOf(expected) === originOf(API_HOST);
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

  /**
   * Pages where a shopper enters credit, identity or payment details. The assistant does not
   * load there at all: nothing it could add is worth sitting next to a credit application.
   * The list is fixed here; the page cannot widen or narrow it.
   */
  var SENSITIVE_PATH = /(^|\/)(getfinancing|get-financing|credit-?app(lication)?|creditapp|preapproved|pre-approved|pre-approval|preapproval|finance-application|apply-for-(credit|financing)|apply-online|secure-credit|checkout|payment|transact|digital-retail(ing)?|sign-?in|log-?in|my-?account)(\/|\.|$)/i;
  function excludedHere() {
    var path = '';
    try {
      path = String(window.location.pathname || '');
    } catch (e) {
      return false;
    }
    return SENSITIVE_PATH.test(path);
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

    if (!expectationHolds(script)) {
      fail('api_origin_mismatch');
      return;
    }

    var cfg = readConfig(script);
    if (!cfg) return;
    if (excludedHere()) return;

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
    version: 'RELEASE_SHA',
    // Read-only facts about this build, for install checks and tests.
    environment: EMBED_ENV,
    apiOrigin: API_HOST,
    widgetOrigin: WIDGET_HOST,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window, document);
