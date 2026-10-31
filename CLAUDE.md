# sankhacooray.com (v3)

Single-page portfolio; see README.md. No build step except the shared scripts below.

## Build

`js/sankha-analytics.js` and `js/sankha-weather.js` are minified builds of
`js/src/<name>.js` (copies of `cdn-sankhacooray-com/js/src/`). Edit in cdn, copy
here, run `./build.sh`, `cmp` against cdn's `js/<name>.js`, commit source + build.
Bump the `?v=` stamp in index.html when CSS/JS changes.

## Lighthouse

<!-- lighthouse-optimized: 2026-10-31 -->
- Baseline: mobile performance 79, accessibility 96, best-practices 100, SEO 100 (desktop 94/96/96/100).
- Fixed: `--text-mute` raised to ≥4.5:1 in all four themes; Google Fonts non-blocking (print/onload + noscript); hero photo as preloaded WebP `srcset` (280/400) and no longer hidden behind the `.reveal` fade (LCP); `a.brand` aria-label removed; shared scripts minified; gtag deferred to after load/idle.
- Not fixable in-repo: cache lifetimes (GitHub Pages behind Cloudflare, `max-age=14400`; would need a Cloudflare Cache Rule), Cloudflare Insights beacon (turn off Web Analytics/RUM in the zone if GA is enough), DOM size of the network/publication lists, a third-party 429 in the console.
