/* =========================================================
   Sankha Cooray — portfolio v3 · live network card
   Fetches the whole-network analytics breakdown from the public
   Apps Script proxy (?scope=network) and renders the "06 — Network"
   section: a network-wide live count, network totals, and a per-site
   leaderboard ranked by 30-day visitors.

   Fails soft: if the proxy is unreachable or returns an error, the
   section stays hidden (it starts hidden in the HTML) so the page never
   shows a broken card. The single-site "fame" badge is handled
   separately by the shared loader (sankha-analytics.js).
   ========================================================= */
(function () {
  "use strict";

  // Same public proxy the shared loader uses (stable /exec deployment).
  var PROXY_URL =
    "https://script.google.com/macros/s/AKfycbwvNZxtG3yOd2YUCDjRxUt9x9BcDP2St-ywC8WcecI_TcqirM3crgTW0qaR_712JTdhdw/exec";

  var section = document.getElementById("network");
  if (!section) return;

  fetch(PROXY_URL + "?scope=network", { method: "GET", cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      if (!data || data.error || data.scope !== "network") return; // stay hidden
      render(data);
    })
    .catch(function () { /* fail soft: section stays hidden */ });

  // ---- helpers ----
  function num(n) {
    n = n || 0;
    return n >= 1000 ? (Math.round(n / 100) / 10) + "k" : String(n);
  }

  // "fold.sankhacooray.com" → "fold"; apex → "sankhacooray.com".
  function label(host) {
    if (host === "sankhacooray.com") return "sankhacooray.com";
    return host.replace(/\.sankhacooray\.com$/, "");
  }

  function ago(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return "";
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 90) return "moments ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h + (h === 1 ? " hour ago" : " hours ago");
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function stat(value, key) {
    var s = el("span", "nr-stat");
    s.appendChild(el("b", null, num(value)));
    s.appendChild(el("span", null, key));
    return s;
  }

  function render(data) {
    var net = data.network || {};
    var live = (net.realtime || {}).activeUsers || 0;

    // Live count + pulsing dot when anyone is on.
    document.getElementById("netLiveNum").textContent = num(live);
    var liveWrap = document.getElementById("netLive");
    if (live > 0) liveWrap.classList.add("is-live");

    // Network totals.
    document.getElementById("netSites").textContent = num(data.totalSites || 0);
    document.getElementById("netToday").textContent = num((net.today || {}).users);
    document.getElementById("net7d").textContent    = num((net.last7d || {}).users);
    document.getElementById("net30d").textContent   = num((net.last30d || {}).users);

    // Per-site leaderboard.
    var sites = (data.sites || []).filter(function (s) {
      // Only rows with some recent traffic — keeps the board meaningful.
      return ((s.last30d || {}).users || (s.last7d || {}).users || (s.today || {}).users) > 0;
    });
    var board = document.getElementById("netBoard");
    var empty = document.getElementById("netEmpty");

    if (!sites.length) {
      empty.hidden = false;
    } else {
      var max = sites.reduce(function (m, s) {
        return Math.max(m, (s.last30d || {}).users || 0);
      }, 0) || 1;

      sites.forEach(function (s) {
        var row = el("li", "net-row");

        row.appendChild(el("span", "nr-rank", "#" + s.rank));

        var site = el("div", "nr-site");
        var host = el("span", "nr-host");
        var a = el("a", null, label(s.host));
        a.href = "https://" + s.host;
        a.target = "_blank";
        a.rel = "noopener";
        host.appendChild(a);
        site.appendChild(host);

        var bar = el("div", "nr-bar");
        var fill = el("span");
        var pct = Math.max(3, Math.round(((s.last30d || {}).users || 0) / max * 100));
        fill.style.width = pct + "%";
        bar.appendChild(fill);
        site.appendChild(bar);
        row.appendChild(site);

        var stats = el("div", "nr-stats");
        stats.appendChild(stat((s.today  || {}).users, "today"));
        stats.appendChild(stat((s.last7d || {}).users, "7d"));
        stats.appendChild(stat((s.last30d || {}).users, "30d"));
        row.appendChild(stats);

        board.appendChild(row);
      });
    }

    var foot = document.getElementById("netFoot");
    var updated = data.cachedAt ? " · updated " + ago(data.cachedAt) : "";
    foot.textContent =
      "Network-wide live count; per-site figures are unique visitors over each window." + updated;

    // Reveal the section now that it has real data.
    section.hidden = false;
    section.querySelectorAll(".reveal").forEach(function (r) { r.classList.add("in"); });
  }
})();
