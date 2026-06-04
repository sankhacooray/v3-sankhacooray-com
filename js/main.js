/* =========================================================
   Sankha Cooray — portfolio v3 · UI behaviour
   Theme switching (localStorage), nav, reveal, filters, flips.
   ========================================================= */
(function () {
  "use strict";
  var root = document.documentElement;

  /* ---------------- Theme switcher ---------------- */
  var THEMES = ["midnight", "aurora", "daylight", "sand"];
  var THEME_COLORS = { midnight: "#0b0d12", aurora: "#0c0a16", daylight: "#ffffff", sand: "#f8f4ec" };
  var sw = document.getElementById("themeSwitch");

  function applyTheme(name) {
    if (THEMES.indexOf(name) === -1) name = "midnight";
    root.setAttribute("data-theme", name);
    try { localStorage.setItem("sc-theme", name); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[name]);
    if (sw) {
      sw.querySelectorAll(".theme-menu li").forEach(function (li) {
        li.setAttribute("aria-selected", li.dataset.theme === name ? "true" : "false");
      });
    }
  }

  if (sw) {
    var btn = sw.querySelector(".theme-btn");
    var menu = sw.querySelector(".theme-menu");
    var setOpen = function (open) {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(menu.hidden); });
    menu.addEventListener("click", function (e) {
      var li = e.target.closest("li");
      if (!li) return;
      applyTheme(li.dataset.theme);
      setOpen(false);
    });
    document.addEventListener("click", function () { setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    // Reflect current theme in the menu (set pre-paint in <head>)
    applyTheme(root.getAttribute("data-theme") || "midnight");
  }

  /* ---------------- Mobile menu ---------------- */
  var toggle = document.getElementById("menuToggle");
  var navLinks = document.getElementById("navLinks");
  if (toggle && navLinks) {
    toggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        navLinks.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------------- Nav: shadow on scroll ---------------- */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------- Reveal on scroll ---------------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------------- Project filters ---------------- */
  var filters = document.getElementById("filters");
  var projects = Array.prototype.slice.call(document.querySelectorAll(".proj"));
  if (filters) {
    filters.addEventListener("click", function (e) {
      var b = e.target.closest(".filter");
      if (!b) return;
      filters.querySelectorAll(".filter").forEach(function (f) {
        var active = f === b;
        f.classList.toggle("is-active", active);
        f.setAttribute("aria-selected", active ? "true" : "false");
      });
      var cat = b.dataset.filter;
      projects.forEach(function (p) {
        p.classList.toggle("hide", cat !== "all" && p.dataset.cat !== cat);
      });
    });
  }

  /* ---------------- Project tap-to-flip (touch) ---------------- */
  projects.forEach(function (p) {
    var card = p.querySelector(".proj-card");
    if (!card) return;
    card.addEventListener("click", function (e) {
      // Let links inside the back face work normally
      if (e.target.closest("a")) return;
      // Only toggle on touch / no-hover devices; hover handles desktop
      if (matchMedia("(hover: none)").matches) card.classList.toggle("flipped");
    });
  });

  /* ---------------- Scroll-spy nav highlight ---------------- */
  var sections = ["about", "experience", "projects", "skills", "contact"]
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  var navAnchors = {};
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    navAnchors[a.getAttribute("href").slice(1)] = a;
  });
  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          Object.values(navAnchors).forEach(function (a) { a.classList.remove("active"); });
          var a = navAnchors[en.target.id];
          if (a) a.classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------------- Footer year ---------------- */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
