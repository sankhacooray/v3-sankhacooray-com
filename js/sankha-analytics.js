/**
 * sankha-analytics.js — one shared script for the whole sankhacooray.com
 * network, loaded by every page (including subdomains, cross-origin) with a
 * single line before </body>:
 *
 *   <script async src="https://sankhacooray.com/js/sankha-analytics.js"></script>
 *
 * Two identical copies are served: this one (cdn.sankhacooray.com) and
 * v3-sankhacooray-com/js/sankha-analytics.js (the apex URL above, which the
 * pages load). Edit here, then copy it over the v3 file.
 *
 * It does two things:
 *   1. Boots Google Analytics (gtag) against the one shared GA4 property,
 *      so every site reports into the same property and is told apart by
 *      hostName.
 *   2. Renders a small "fame" badge in the bottom corner showing how busy
 *      THIS site is today and where it ranks among its sibling sites this
 *      month — data comes from the public Apps Script proxy, which never
 *      exposes credentials, only aggregate counts.
 *
 * Maintained in ONE place: change the two CONFIG values below and every
 * site picks it up on next load. Both features fail soft — a missing /
 * unreachable proxy just hides the badge; a missing measurement ID just
 * skips gtag. Nothing here can break a page.
 *
 * ─── CONFIGURE THESE TWO VALUES (see SETUP.md in analytics-sankhacooray-com) ───
 */
(function () {
  'use strict';

  // Per-page overrides via the loading <script> tag's data-* attributes:
  //   data-measurement-id="G-XXXX"  → report into a different GA4 property
  //                                    (e.g. a dedicated medical-suite property)
  //   data-badge="off"              → GA tracking only, no public visitor badge
  //                                    (used on the login-gated suite apps)
  var self = document.currentScript || document.querySelector('script[src*="sankha-analytics.js"]');
  var idAttr = self && self.getAttribute('data-measurement-id');
  var badgeAttr = self && self.getAttribute('data-badge');

  var CONFIG = {
    // GA4 Measurement ID. Defaults to the shared network property; override per
    // page with data-measurement-id. Format: G-XXXXXXXXXX.
    // Get it from GA4 Admin → Data Streams → your web stream.
    MEASUREMENT_ID: idAttr || 'G-EPVPJGS2JL',

    // The Apps Script web-app /exec URL (the analytics proxy deployment).
    // Get it after `npm run deploy` in analytics-sankhacooray-com.
    PROXY_URL: 'https://script.google.com/macros/s/AKfycbwvNZxtG3yOd2YUCDjRxUt9x9BcDP2St-ywC8WcecI_TcqirM3crgTW0qaR_712JTdhdw/exec',

    // Public visitor badge. On by default; set data-badge="off" to ship gtag only.
    SHOW_BADGE: badgeAttr !== 'off'
  };

  // ───────────────────────── who counts ──────────────────────────
  // Only real network hosts are tracked: workers.dev previews, localhost and
  // file previews never reach GA.
  //
  // Owner opt-out: open any network page with ?me=on once per browser and GA
  // stops counting that browser on every subdomain (the cookie lives on
  // .sankhacooray.com); ?me=off undoes it. The cookie is re-written on each
  // visit because Safari caps script-set cookies at 7 days.
  var ME_COOKIE = 'sankha_me';
  var onNetwork = /(^|\.)sankhacooray\.com$/.test(location.hostname);

  function setMe(on) {
    document.cookie = ME_COOKIE + '=' + (on ? '1' : '') + '; domain=.sankhacooray.com; path=/; max-age=' +
      (on ? 400 * 86400 : 0) + '; SameSite=Lax; Secure';
  }

  var meParam = /[?&]me=(on|off)\b/.exec(location.search);
  if (meParam && onNetwork) {
    setMe(meParam[1] === 'on');
    ready(function () {
      notice(meParam[1] === 'on' ? 'Analytics off for this browser' : 'Analytics on for this browser');
    });
  }
  var isMe = cookieVal(ME_COOKIE) === '1';
  if (isMe) setMe(true);
  if (isMe && onNetwork) seenPing();

  function cookieVal(name) {
    var m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(document.cookie);
    return m ? m[1] : '';
  }

  // Once a day an excluded browser tells the proxy (Me.js) it's still around,
  // so the private console can list the owner's browsers and when each was
  // last seen. Same id and label rules as cdn.sankhacooray.com/me.
  function seenPing() {
    var today = new Date().toISOString().slice(0, 10);
    if (cookieVal('sankha_me_seen') === today) return;
    var tail = '; domain=.sankhacooray.com; path=/; SameSite=Lax; Secure';
    document.cookie = 'sankha_me_seen=' + today + tail + '; max-age=86400';
    var id = cookieVal('sankha_me_id');
    if (!/^[a-f0-9]{16}$/.test(id)) {
      var b = new Uint8Array(8); crypto.getRandomValues(b);
      id = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }
    document.cookie = 'sankha_me_id=' + id + tail + '; max-age=' + 400 * 86400;
    var ua = navigator.userAgent;
    var br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
           : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    var os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
           : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    new Image().src = CONFIG.PROXY_URL + '?source=me&state=seen&id=' + id +
      '&label=' + encodeURIComponent(br + (os ? ' · ' + os : '')) + '&host=' + encodeURIComponent(location.hostname);
  }

  // ───────────────────────────── gtag ─────────────────────────────
  (function bootGtag() {
    var id = CONFIG.MEASUREMENT_ID;
    if (!id || id.indexOf('XXXX') !== -1) return;   // not configured yet
    if (!onNetwork || isMe) return;                 // preview host, or the owner

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
  })();

  // ──────────────────────── fame badge ────────────────────────────
  if (!CONFIG.SHOW_BADGE) return;
  if (/REPLACE_WITH_DEPLOYMENT_ID/.test(CONFIG.PROXY_URL)) return;  // not configured

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var host = location.hostname.replace(/^www\./, '');
    // Skip on localhost / file previews — nothing meaningful to show.
    if (!host || host === 'localhost' || host === '127.0.0.1') return;

    var url = CONFIG.PROXY_URL + '?host=' + encodeURIComponent(host);
    fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        if (!data || data.error) return;   // proxy not ready — stay invisible
        renderBadge(data);
      })
      .catch(function () { /* fail soft: no badge */ });
  });

  // Short confirmation pill for ?me=on / ?me=off, gone after 4 s.
  function notice(text) {
    var el = document.createElement('div');
    el.textContent = text;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483001;' +
      'padding:8px 14px;border-radius:999px;font:500 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'color:#e8e8ee;background:rgba(18,18,22,.9);box-shadow:0 4px 16px rgba(0,0,0,.3);';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function num(n) {
    n = n || 0;
    return n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(n);
  }

  function renderBadge(data) {
    var site    = data.site || {};
    var today   = (site.today   || {}).users || 0;
    var week    = (site.last7d  || {}).users || 0;
    var month   = (site.last30d || {}).users || 0;
    var rank    = data.rank;
    var total   = data.totalSites || 0;
    var netLive = ((data.network || {}).realtime || {}).activeUsers || 0;

    // Headline: prefer the freshest non-zero per-site figure.
    var label;
    if (today > 0)      label = num(today) + (today === 1 ? ' visitor today' : ' visitors today');
    else if (week > 0)  label = num(week) + ' this week';
    else if (month > 0) label = num(month) + ' this month';
    else                label = 'new here';

    // Rank suffix tells a visitor how famous THIS site is in the network.
    var rankText = (rank && total > 1) ? ('#' + rank + ' of ' + total) : '';

    // Title (hover) carries the fuller picture without cluttering the pill.
    var title =
      'This site — today: ' + num(today) +
      ' · 7d: ' + num(week) +
      ' · 30d: ' + num(month) +
      (rankText ? ' · network rank ' + rankText : '') +
      '\nNetwork live now: ' + num(netLive) + ' active';

    var pill = document.createElement('div');
    pill.id = 'sankha-fame-badge';
    pill.setAttribute('role', 'status');
    pill.setAttribute('title', title);

    var dot = document.createElement('span');
    dot.className = 'sfb-dot' + (netLive > 0 ? ' sfb-live' : '');

    var text = document.createElement('span');
    text.className = 'sfb-text';
    text.textContent = label;
    if (rankText) text.textContent += ' · ' + rankText;

    pill.appendChild(dot);
    pill.appendChild(text);

    injectStyles();
    document.body.appendChild(pill);
  }

  function injectStyles() {
    if (document.getElementById('sankha-fame-style')) return;
    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var css = [
      '#sankha-fame-badge{',
        'position:fixed;right:14px;bottom:14px;z-index:2147483000;',
        'display:flex;align-items:center;gap:7px;',
        'padding:6px 11px;border-radius:999px;',
        'font:500 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
        'color:#e8e8ee;background:rgba(18,18,22,.82);',
        '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
        'border:1px solid rgba(255,255,255,.12);',
        'box-shadow:0 4px 16px rgba(0,0,0,.28);',
        'user-select:none;cursor:default;',
        'opacity:0;transform:translateY(6px);',
        (reduce ? '' : 'transition:opacity .4s ease,transform .4s ease;'),
        'animation:sfb-in .01s forwards;',
      '}',
      '@keyframes sfb-in{to{opacity:1;transform:translateY(0)}}',
      '#sankha-fame-badge .sfb-dot{',
        'width:7px;height:7px;border-radius:50%;flex:0 0 auto;',
        'background:#8a8a93;',
      '}',
      '#sankha-fame-badge .sfb-dot.sfb-live{background:#37d67a;',
        (reduce ? '' : 'box-shadow:0 0 0 0 rgba(55,214,122,.6);animation:sfb-pulse 2s infinite;'),
      '}',
      '@keyframes sfb-pulse{',
        '0%{box-shadow:0 0 0 0 rgba(55,214,122,.55)}',
        '70%{box-shadow:0 0 0 7px rgba(55,214,122,0)}',
        '100%{box-shadow:0 0 0 0 rgba(55,214,122,0)}',
      '}',
      '@media print{#sankha-fame-badge{display:none}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'sankha-fame-style';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
