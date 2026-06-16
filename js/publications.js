/* =========================================================
   Sankha Cooray — portfolio v3 · publications
   Auto-links my academic publications by ORCID. Fetches works
   from the public OpenAlex API (no auth, CORS-enabled), dedupes
   preprint/published pairs, enriches any missing venue names from
   Crossref, then renders the "05 — Publications" section.

   Fully client-side — OpenAlex/Crossref hold no secrets, so unlike
   the GitHub + analytics proxies there's no Apps Script backend.
   Stale-while-revalidate: a cached copy (localStorage, 12h) paints
   instantly, then a fresh fetch updates citation counts in place.

   Fails soft: if everything is unreachable and there's no cache, the
   section stays hidden (it starts hidden in the HTML) so the page
   never shows a broken card.
   ========================================================= */
(function () {
  "use strict";

  var ORCID = "0009-0000-2186-3807";
  var ME = "sankha cooray"; // normalized, for bolding my name in author lists
  var MAILTO = "sankha@ahlab.org"; // OpenAlex/Crossref "polite pool" contact
  var CACHE_KEY = "sc-pubs-v1";
  var CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
  var MAX_AUTHORS = 12; // collapse to "et al." beyond this

  var OPENALEX =
    "https://api.openalex.org/works" +
    "?filter=author.orcid:https://orcid.org/" + ORCID +
    "&sort=publication_date:desc&per-page=100&mailto=" + MAILTO;

  var section = document.getElementById("publications");
  if (!section) return;

  // 1) Paint from cache immediately (if fresh-ish), then revalidate.
  var cached = readCache();
  if (cached && cached.length) render(cached);

  load();

  function load() {
    fetchJson(OPENALEX)
      .then(function (data) {
        var works = dedupe((data && data.results) || []);
        if (!works.length) return Promise.reject("no works");
        // Enrich venue from Crossref only for items that need it.
        return enrichVenues(works);
      })
      .then(function (pubs) {
        writeCache(pubs);
        render(pubs);
      })
      .catch(function () {
        /* fail soft: keep whatever the cache already rendered */
      });
  }

  // ---- fetch helpers ----
  function fetchJson(url) {
    return fetch(url, { method: "GET", cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : Promise.reject(r.status);
    });
  }

  // One retry — Crossref occasionally throttles a request in a parallel
  // burst; a single immediate retry clears the transient blip.
  function fetchJsonRetry(url) {
    return fetchJson(url).catch(function () { return fetchJson(url); });
  }

  // ---- shaping ----
  function normTitle(t) {
    return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  // Collapse preprint/published duplicates that share a title; keep the
  // most "published" copy (non-preprint wins, then more citations).
  function dedupe(results) {
    var best = {};
    results.forEach(function (w) {
      if (w.is_paratext || w.is_retracted || !w.title) return;
      var key = normTitle(w.title);
      var cur = best[key];
      if (!cur || score(w) > score(cur)) best[key] = w;
    });
    return Object.keys(best)
      .map(function (k) { return shape(best[k]); })
      .sort(function (a, b) {
        if (b.year !== a.year) return b.year - a.year;
        return b.citations - a.citations;
      });

    function score(w) {
      var s = w.cited_by_count || 0;
      if (w.type !== "preprint") s += 100000; // strongly prefer published
      if (((w.primary_location || {}).source || {}).display_name) s += 1000;
      return s;
    }
  }

  function shape(w) {
    var authors = (w.authorships || []).map(function (a) {
      return (a.author && a.author.display_name) || "";
    }).filter(Boolean);

    var venue = ((w.primary_location || {}).source || {}).display_name || null;
    var doi = w.doi || null; // full https://doi.org/... URL
    var bareDoi = doi ? doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : null;

    return {
      title: w.title,
      year: w.publication_year || 0,
      type: w.type || "article",
      venue: venue,
      doi: doi,
      bareDoi: bareDoi,
      url: doi || (w.primary_location || {}).landing_page_url || w.id || "#",
      citations: w.cited_by_count || 0,
      isOa: !!(w.open_access && w.open_access.is_oa),
      authors: authors
    };
  }

  // For works OpenAlex has no venue for, ask Crossref (which carries the
  // proceedings / journal title for the same DOI). Runs in parallel and
  // never rejects the batch — a failed lookup just leaves venue null.
  function enrichVenues(pubs) {
    var jobs = pubs.map(function (p) {
      if (p.venue || !p.bareDoi) return Promise.resolve(p);
      return fetchJsonRetry(
        "https://api.crossref.org/works/" +
          encodeURIComponent(p.bareDoi) + "?mailto=" + MAILTO
      )
        .then(function (cr) {
          var m = (cr && cr.message) || {};
          var ct = m["container-title"];
          p.venue = (ct && ct[0]) || (m.publisher || null);
          return p;
        })
        .catch(function () { return p; });
    });
    return Promise.all(jobs);
  }

  // ---- rendering ----
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function authorsHtml(authors) {
    var list = authors.slice(0, MAX_AUTHORS);
    var frag = document.createDocumentFragment();
    list.forEach(function (name, i) {
      if (i) frag.appendChild(document.createTextNode(", "));
      var isMe = name.toLowerCase().replace(/[^a-z]/g, "") ===
                 ME.replace(/[^a-z]/g, "");
      frag.appendChild(el(isMe ? "strong" : "span", null, name));
    });
    if (authors.length > MAX_AUTHORS) {
      frag.appendChild(document.createTextNode(", et al."));
    }
    return frag;
  }

  function render(pubs) {
    if (!pubs || !pubs.length) return;

    var list = document.getElementById("pubsList");
    var summary = document.getElementById("pubsSummary");
    if (!list) return;
    list.textContent = ""; // clear (revalidate re-renders in place)

    var totalCites = pubs.reduce(function (s, p) { return s + p.citations; }, 0);
    if (summary) {
      summary.textContent =
        pubs.length + (pubs.length === 1 ? " publication" : " publications") +
        " · " + totalCites + (totalCites === 1 ? " citation" : " citations");
    }

    pubs.forEach(function (p) {
      var li = el("li", "pub reveal in");

      li.appendChild(el("span", "pub-year", p.year || "—"));

      var body = el("div", "pub-body");

      var title = el("a", "pub-title", p.title);
      title.href = p.url;
      title.target = "_blank";
      title.rel = "noopener";
      body.appendChild(title);

      if (p.venue) body.appendChild(el("p", "pub-venue", p.venue));

      var auth = el("p", "pub-authors");
      auth.appendChild(authorsHtml(p.authors));
      body.appendChild(auth);

      var meta = el("div", "pub-meta");
      if (p.isOa) meta.appendChild(el("span", "pub-badge", "Open access"));
      if (p.citations > 0) {
        meta.appendChild(el("span", "pub-cites",
          p.citations + (p.citations === 1 ? " citation" : " citations")));
      }
      if (p.doi) {
        var link = el("a", "pub-doi", "DOI ↗");
        link.href = p.doi;
        link.target = "_blank";
        link.rel = "noopener";
        meta.appendChild(link);
      }
      body.appendChild(meta);

      li.appendChild(body);
      list.appendChild(li);
    });

    section.hidden = false;
    section.querySelectorAll(".reveal").forEach(function (r) {
      r.classList.add("in");
    });
  }

  // ---- cache ----
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || (Date.now() - obj.at) > CACHE_TTL_MS) return null;
      return obj.pubs;
    } catch (e) { return null; }
  }

  function writeCache(pubs) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), pubs: pubs }));
    } catch (e) { /* ignore quota / privacy mode */ }
  }
})();
