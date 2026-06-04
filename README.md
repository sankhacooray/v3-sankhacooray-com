# v3.sankhacooray.com — Portfolio

The current personal portfolio for Sankha Cooray — a fresh, modern,
single-page site. No build step: plain `index.html` + CSS + JS, hosted on
GitHub Pages.

## Features

- **Sections:** hero, about, experience timeline + education, filterable
  projects (hover/tap-to-reveal cards), skills, recognition, contact form.
- **Multiple themes** — Midnight, Aurora, Daylight, Sand — switchable from the
  nav and **persisted in `localStorage`** (`sc-theme`). First visit defaults to
  the OS light/dark preference. Theme is applied pre-paint to avoid a flash.
- **Contact form** with no exposed phone/email/address — submissions go to a
  Google Apps Script backend (see the `contact-sankhacooray-com` repo). A
  honeypot field drops bots; success/error states are handled inline.
- Responsive, accessible (keyboard, `aria`, reduced-motion), with OG/Twitter
  share meta and a web manifest.

## Wiring the contact form

1. Deploy the Apps Script backend in `contact-sankhacooray-com` (see its README)
   and copy the `/exec` web-app URL.
2. Paste it into [`js/contact.js`](js/contact.js) → `APPS_SCRIPT_URL`.

Until that URL is set, the form shows a friendly "reach me on LinkedIn" message
instead of failing.

## Structure

```
index.html
css/styles.css          # themes via [data-theme] custom properties
js/main.js              # theme switch, nav, reveal, filters, scroll-spy
js/contact.js           # form fetch → Apps Script
images/                 # profile + project thumbnails
icon.svg, manifest.webmanifest, CNAME
```

## Deploy

Static files on GitHub Pages. `CNAME` points `v3.sankhacooray.com` at the Pages
site. Push to the default branch to publish.

## Related

- `v2-sankhacooray-com` — the experimental "credit cards" concept.
- `contact-sankhacooray-com` — the Apps Script form backend.
