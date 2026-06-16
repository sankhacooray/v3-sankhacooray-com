/**
 * sankha-weather.js — one shared ambient-weather layer for the whole
 * sankhacooray.com network. Hosted on the main site and loaded by every
 * page (including subdomains, cross-origin) with a single line before
 * </body>:
 *
 *   <script async src="https://sankhacooray.com/js/sankha-weather.js"></script>
 *
 * What it does, entirely client-side and with NO API token:
 *   1. Finds the visitor's approximate location from their IP (ipwho.is —
 *      HTTPS, CORS, no key, no permission prompt). Falls back gracefully.
 *   2. Fetches the CURRENT weather there from Open-Meteo (open-meteo.com —
 *      no key), reading the WMO weather_code + is_day flag.
 *   3. Paints a subtle, full-viewport canvas animation matching the real
 *      weather — rain, snow, fog, drifting clouds, a daytime sun glow or a
 *      starry night — behind the UI, never capturing pointer events.
 *
 * Design notes:
 *   - Theme-aware: particle colours adapt to a light or dark page (detected
 *     from [data-theme] or, failing that, the page's background luminance),
 *     so it looks right on every site in the network, not just v3.
 *   - Gentle on the machine: requestAnimationFrame, pauses on a hidden tab,
 *     honours prefers-reduced-motion (draws a single static frame), caps
 *     particle counts, and caches location (24h) + weather (30m) so repeat
 *     loads don't hammer the APIs.
 *   - Fails soft: any network/parse error just means no overlay. Nothing
 *     here can break a page.
 *   - Testing: append ?wx=rain|snow|clear|clouds|fog|thunder (optionally
 *     &night=1 / &day=1) to force a condition without waiting on the APIs.
 */
(function () {
  'use strict';

  if (window.__sankhaWeather) return; // single instance per page
  window.__sankhaWeather = true;

  var CONFIG = {
    INTENSITY: 0.6,          // 0..1 — overall density/opacity (subtle by default)
    LOCATION_TTL: 864e5,     // 24h
    WEATHER_TTL: 18e5,       // 30m
    Z_INDEX: 90              // above page content, below the nav (z-index:100)
  };

  var override = (window.SANKHA_WEATHER || {});
  var qs = parseQuery();

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  ready(start);

  // ───────────────────────── orchestration ─────────────────────────
  function start() {
    var forced = qs.wx || override.force;
    if (forced) {
      var isDay = qs.night ? 0 : (qs.day ? 1 : 1);
      return boot({ condition: forced, isDay: isDay });
    }
    locate()
      .then(function (loc) { return weather(loc.lat, loc.lon); })
      .then(function (wx) { boot(wx); })
      .catch(function () { /* fail soft: no overlay */ });
  }

  function boot(wx) {
    var scene = sceneFor(wx.condition, wx.isDay);
    if (scene === 'none') return;
    var engine = createEngine();
    engine.run(scene);
  }

  // ───────────────────────── location ──────────────────────────────
  // IP → approximate location, no key, no permission prompt. Providers
  // are tried in order; each must send CORS headers on a browser GET.
  // (ipwho.is was dropped — it now blocks CORS on its free plan.)
  var GEO_PROVIDERS = [
    { url: 'https://get.geojs.io/v1/ip/geo.json', parse: function (d) {
        return d && d.latitude != null
          ? { lat: +d.latitude, lon: +d.longitude, city: d.city || '' } : null;
      } },
    { url: 'https://ipapi.co/json/', parse: function (d) {
        return d && !d.error && d.latitude != null
          ? { lat: +d.latitude, lon: +d.longitude, city: d.city || '' } : null;
      } }
  ];

  function locate() {
    var cached = cacheGet('sc-wx-loc', CONFIG.LOCATION_TTL);
    if (cached) return Promise.resolve(cached);
    return tryGeo(0);
  }

  function tryGeo(i) {
    if (i >= GEO_PROVIDERS.length) return Promise.reject('geo');
    var p = GEO_PROVIDERS[i];
    return fetchJson(p.url).then(function (d) {
      var loc = p.parse(d);
      if (!loc || !isFinite(loc.lat) || !isFinite(loc.lon)) throw 'geo';
      cacheSet('sc-wx-loc', loc);
      return loc;
    }).catch(function () { return tryGeo(i + 1); });
  }

  // ───────────────────────── weather ───────────────────────────────
  function weather(lat, lon) {
    var key = 'sc-wx-data';
    var cached = cacheGet(key, CONFIG.WEATHER_TTL);
    if (cached) return Promise.resolve(cached);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon + '&current=weather_code,is_day&timezone=auto';
    return fetchJson(url).then(function (d) {
      var c = (d && d.current) || {};
      if (c.weather_code == null) throw 'wx';
      var wx = { condition: classify(c.weather_code), isDay: c.is_day };
      cacheSet(key, wx);
      return wx;
    });
  }

  // WMO weather code → coarse condition bucket.
  function classify(code) {
    if (code >= 95) return 'thunder';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    if (code === 2 || code === 3) return 'clouds';
    return 'clear'; // 0,1
  }

  // condition + day/night → which animation to render.
  function sceneFor(condition, isDay) {
    switch (condition) {
      case 'rain': return 'rain';
      case 'thunder': return 'thunder';
      case 'snow': return 'snow';
      case 'fog': return 'fog';
      case 'clouds': return 'clouds';
      case 'clear': return isDay ? 'sun' : 'stars';
      default: return 'none';
    }
  }

  // ───────────────────────── render engine ─────────────────────────
  function createEngine() {
    var canvas = document.createElement('canvas');
    canvas.id = 'sankha-weather-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    var s = canvas.style;
    s.position = 'fixed'; s.inset = '0'; s.width = '100%'; s.height = '100%';
    s.pointerEvents = 'none'; s.zIndex = String(CONFIG.Z_INDEX);
    // Keep it off the page when printing.
    injectPrintRule();
    document.body.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var scene = 'rain';
    var palette = readPalette();
    var rafId = null, flash = 0, flashTimer = 0, tick = 0;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    // Particle counts scale with viewport area, then clamp — subtle.
    function count(divisor, min, max) {
      var n = Math.round((W * H) / divisor * CONFIG.INTENSITY);
      return Math.max(min, Math.min(max, n));
    }

    function seed() {
      particles = [];
      var i, n;
      if (scene === 'rain' || scene === 'thunder') {
        n = count(9000, 30, 220);
        for (i = 0; i < n; i++) particles.push(rainDrop());
      } else if (scene === 'snow') {
        n = count(14000, 20, 140);
        for (i = 0; i < n; i++) particles.push(snowFlake());
      } else if (scene === 'stars') {
        n = count(11000, 24, 130);
        for (i = 0; i < n; i++) particles.push(star());
      } else if (scene === 'sun') {
        n = count(26000, 8, 46);
        for (i = 0; i < n; i++) particles.push(mote());
      } else if (scene === 'clouds' || scene === 'fog') {
        n = scene === 'fog' ? 5 : 7;
        for (i = 0; i < n; i++) particles.push(cloud(i, n));
      }
    }

    function rainDrop() {
      return {
        x: Math.random() * W, y: Math.random() * H,
        len: 9 + Math.random() * 14, sp: 7 + Math.random() * 6,
        a: 0.12 + Math.random() * 0.22
      };
    }
    function snowFlake() {
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: 1 + Math.random() * 2.4, sp: 0.5 + Math.random() * 1.1,
        drift: 0.4 + Math.random() * 0.7, ph: Math.random() * 6.28,
        a: 0.35 + Math.random() * 0.45
      };
    }
    function star() {
      return {
        x: Math.random() * W, y: Math.random() * (H * 0.7),
        r: 0.5 + Math.random() * 1.3, ph: Math.random() * 6.28,
        sp: 0.6 + Math.random() * 1.6, a: 0.3 + Math.random() * 0.5
      };
    }
    function mote() {
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: 0.6 + Math.random() * 1.6, sp: 0.15 + Math.random() * 0.35,
        drift: (Math.random() - 0.5) * 0.4, ph: Math.random() * 6.28,
        a: 0.06 + Math.random() * 0.12
      };
    }
    function cloud(i, n) {
      return {
        x: (i / n) * (W + 400) - 200, y: 40 + Math.random() * (H * 0.5),
        r: 120 + Math.random() * 180, sp: 0.08 + Math.random() * 0.16,
        a: 0.05 + Math.random() * 0.07
      };
    }

    function step() {
      ctx.clearRect(0, 0, W, H);
      tick++;
      if (scene === 'sun') drawGlow(palette.sun, 0.85);
      if (scene === 'stars') drawGlow(palette.moon, 0.9);
      if (scene === 'fog') drawFogTint();

      var i, p;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        if (scene === 'rain' || scene === 'thunder') {
          p.y += p.sp; p.x += p.sp * 0.18;
          if (p.y > H) { p.y = -p.len; p.x = Math.random() * W; }
          ctx.strokeStyle = rgba(palette.rain, p.a);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.sp * 0.18 * 2, p.y - p.len);
          ctx.stroke();
        } else if (scene === 'snow') {
          p.ph += 0.01; p.y += p.sp; p.x += Math.sin(p.ph) * p.drift;
          if (p.y > H) { p.y = -4; p.x = Math.random() * W; }
          dot(p.x, p.y, p.r, rgba(palette.snow, p.a));
        } else if (scene === 'stars') {
          p.ph += 0.02 * p.sp;
          var tw = p.a * (0.55 + 0.45 * Math.sin(p.ph));
          dot(p.x, p.y, p.r, rgba(palette.star, tw));
        } else if (scene === 'sun') {
          p.ph += 0.01; p.y -= p.sp; p.x += p.drift + Math.sin(p.ph) * 0.2;
          if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
          dot(p.x, p.y, p.r, rgba(palette.mote, p.a));
        } else if (scene === 'clouds' || scene === 'fog') {
          p.x += p.sp;
          if (p.x - p.r > W) { p.x = -p.r - Math.random() * 200; }
          drawCloud(p.x, p.y, p.r, p.a);
        }
      }

      if (scene === 'thunder') drawLightning();
      rafId = window.requestAnimationFrame(step);
    }

    // ---- drawing helpers ----
    function dot(x, y, r, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    function drawGlow(color, scale) {
      var cx = W * 0.82, cy = H * 0.16, rad = Math.max(W, H) * 0.5 * scale;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, rgba(color, 0.22));
      g.addColorStop(0.4, rgba(color, 0.08));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function drawCloud(x, y, r, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(palette.cloud, a));
      g.addColorStop(1, rgba(palette.cloud, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    function drawFogTint() {
      ctx.fillStyle = rgba(palette.cloud, 0.04);
      ctx.fillRect(0, 0, W, H);
    }
    function drawLightning() {
      if (flashTimer <= 0) {
        // schedule next strike roughly every 4–9s
        if (Math.random() < 0.004) { flashTimer = 6; flash = 0.5; }
      } else {
        flashTimer--;
        ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5) + ')';
        ctx.fillRect(0, 0, W, H);
        flash *= 0.6;
      }
    }

    function staticFrame() {
      // reduced-motion: one calm frame, no loop.
      ctx.clearRect(0, 0, W, H);
      if (scene === 'sun') drawGlow(palette.sun, 0.85);
      else if (scene === 'stars') { drawGlow(palette.moon, 0.9); drawAll(); }
      else if (scene === 'clouds' || scene === 'fog') { if (scene === 'fog') drawFogTint(); drawAll(); }
      else drawAll();
      function drawAll() {
        for (var i = 0; i < particles.length; i++) {
          var p = particles[i];
          if (scene === 'rain' || scene === 'thunder') {
            ctx.strokeStyle = rgba(palette.rain, p.a);
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - p.len); ctx.stroke();
          } else if (scene === 'snow') dot(p.x, p.y, p.r, rgba(palette.snow, p.a));
          else if (scene === 'stars') dot(p.x, p.y, p.r, rgba(palette.star, p.a));
          else if (scene === 'sun') dot(p.x, p.y, p.r, rgba(palette.mote, p.a));
          else if (scene === 'clouds' || scene === 'fog') drawCloud(p.x, p.y, p.r, p.a);
        }
      }
    }

    function play() {
      if (rafId == null) rafId = window.requestAnimationFrame(step);
    }
    function pause() {
      if (rafId != null) { window.cancelAnimationFrame(rafId); rafId = null; }
    }

    return {
      run: function (sc) {
        scene = sc;
        resize();
        if (reduceMotion) { staticFrame(); }
        else { play(); }

        var rt;
        window.addEventListener('resize', function () {
          clearTimeout(rt);
          rt = setTimeout(function () {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            resize();
            if (reduceMotion) staticFrame();
          }, 200);
        });
        document.addEventListener('visibilitychange', function () {
          if (reduceMotion) return;
          if (document.hidden) pause(); else play();
        });
        // Recolour on live theme switches.
        if (window.MutationObserver) {
          new MutationObserver(function () {
            palette = readPalette();
            if (reduceMotion) staticFrame();
          }).observe(document.documentElement, {
            attributes: true, attributeFilter: ['data-theme']
          });
        }
      }
    };
  }

  // ───────────────────────── palette ───────────────────────────────
  function readPalette() {
    var dark = isDarkPage();
    if (dark) {
      return {
        rain: [173, 206, 255], snow: [255, 255, 255], star: [255, 255, 255],
        mote: [255, 240, 200], cloud: [200, 215, 240],
        sun: [255, 214, 140], moon: [150, 180, 230]
      };
    }
    return {
      rain: [70, 110, 165], snow: [150, 175, 205], star: [90, 110, 150],
      mote: [255, 200, 120], cloud: [120, 140, 170],
      sun: [255, 190, 110], moon: [120, 150, 200]
    };
  }

  function isDarkPage() {
    var t = (document.documentElement.getAttribute('data-theme') || '').toLowerCase();
    if (t === 'midnight' || t === 'aurora') return true;
    if (t === 'daylight' || t === 'sand') return false;
    // Unknown theme system: sample the page background luminance.
    try {
      var bg = getComputedStyle(document.body).backgroundColor ||
               getComputedStyle(document.documentElement).backgroundColor;
      var m = bg.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        var lum = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
        return lum < 128;
      }
    } catch (e) {}
    return true; // default dark
  }

  // ───────────────────────── utilities ─────────────────────────────
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : Promise.reject(r.status);
    });
  }

  function cacheGet(key, ttl) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || (Date.now() - o.at) > ttl) return null;
      return o.v;
    } catch (e) { return null; }
  }
  function cacheSet(key, v) {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v: v })); } catch (e) {}
  }

  function parseQuery() {
    var out = {};
    (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      out[decodeURIComponent(p[0])] = p[1] ? decodeURIComponent(p[1]) : '1';
    });
    return out;
  }

  function injectPrintRule() {
    if (document.getElementById('sankha-weather-style')) return;
    var st = document.createElement('style');
    st.id = 'sankha-weather-style';
    st.textContent = '@media print{#sankha-weather-canvas{display:none}}';
    document.head.appendChild(st);
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }
})();
