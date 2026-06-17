/**
 * sankha-chat.js — one shared chat widget for the whole sankhacooray.com
 * network. Hosted on the main site and loaded by every page (including
 * subdomains, cross-origin) with a single line before </body>:
 *
 *   <script async src="https://sankhacooray.com/js/sankha-chat.js"></script>
 *
 * It renders a small launcher button; clicking it opens a chat panel that
 * answers questions ABOUT this site only. The browser never holds any API key
 * — it POSTs the conversation to the Cloudflare Worker proxy (see
 * chat-sankhacooray-com), which adds the key, the scoped system prompt, and the
 * baked site knowledge, then streams Claude's reply back.
 *
 * Fails soft: if the Worker URL isn't configured or the proxy is unreachable,
 * the widget simply shows an error line — nothing here can break a page.
 *
 * ─── CONFIGURE: set WORKER_URL to your deployed Worker (see README) ───
 */
(function () {
  'use strict';

  var CONFIG = {
    // The deployed Cloudflare Worker URL. After `npm run deploy` in
    // chat-sankhacooray-com, paste the printed URL here, e.g.
    // 'https://chat-sankhacooray-com.<subdomain>.workers.dev'
    // or 'https://chat.sankhacooray.com' if you set up the custom domain.
    WORKER_URL: 'https://chat-sankhacooray-com.sankha-9a1.workers.dev',

    TITLE: 'Ask about Sankha',
    GREETING:
      "Hi! I can answer questions about Sankha Cooray — his experience, projects, skills, and how to reach him. What would you like to know?",
    PLACEHOLDER: 'Ask about experience, projects, contact…'
  };

  // Don't double-inject, and bail if not configured yet.
  if (window.__sankhaChatLoaded) return;
  if (/REPLACE_WITH_SUBDOMAIN/.test(CONFIG.WORKER_URL)) return;
  window.__sankhaChatLoaded = true;

  // Conversation history sent to the Worker each turn: [{role, content}].
  var history = [];
  var streaming = false;
  var els = {};

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    injectStyles();
    buildLauncher();
  });

  // ───────────────────────────── UI build ─────────────────────────────

  function buildLauncher() {
    var btn = document.createElement('button');
    btn.id = 'sankha-chat-launcher';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open site chat');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
      '<path fill="currentColor" d="M12 3C6.5 3 2 6.7 2 11.3c0 2.3 1.2 4.4 3.1 5.9-.1 1-.6 2.4-1.6 3.4 1.6-.2 3.3-.8 4.6-1.7 1.2.4 2.5.6 3.9.6 5.5 0 10-3.7 10-8.2S17.5 3 12 3z"/>' +
      '</svg>';
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);
    els.launcher = btn;
  }

  function buildPanel() {
    if (els.panel) return;

    var panel = document.createElement('div');
    panel.id = 'sankha-chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', CONFIG.TITLE);

    // Header
    var header = document.createElement('div');
    header.className = 'scp-header';
    var title = document.createElement('span');
    title.className = 'scp-title';
    title.textContent = CONFIG.TITLE;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'scp-close';
    close.setAttribute('aria-label', 'Close chat');
    close.innerHTML = '&times;';
    close.addEventListener('click', togglePanel);
    header.appendChild(title);
    header.appendChild(close);

    // Messages
    var log = document.createElement('div');
    log.className = 'scp-log';
    els.log = log;

    // Composer
    var form = document.createElement('form');
    form.className = 'scp-form';
    var input = document.createElement('textarea');
    input.className = 'scp-input';
    input.rows = 1;
    input.placeholder = CONFIG.PLACEHOLDER;
    input.setAttribute('aria-label', 'Your message');
    var sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'scp-send';
    sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<path fill="currentColor" d="M3 11l18-8-8 18-2-7-8-3z"/></svg>';

    form.appendChild(input);
    form.appendChild(sendBtn);
    form.addEventListener('submit', onSubmit);

    // Enter to send, Shift+Enter for newline.
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e);
      }
    });

    panel.appendChild(header);
    panel.appendChild(log);
    panel.appendChild(form);
    document.body.appendChild(panel);

    els.panel = panel;
    els.input = input;
    els.send = sendBtn;

    addMessage('bot', CONFIG.GREETING);
  }

  function togglePanel() {
    buildPanel();
    var open = els.panel.classList.toggle('scp-open');
    els.launcher.classList.toggle('scp-hidden', open);
    if (open) setTimeout(function () { els.input.focus(); }, 50);
  }

  // ──────────────────────────── messaging ─────────────────────────────

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Minimal, safe Markdown → HTML for the bot's replies. Input is HTML-escaped
  // first, so no raw tag from the model (or echoed user text) can inject markup.
  // Supports **bold**, *italic*, `code`, [text](url), bare URLs, "- " bullets,
  // and line breaks. Partial markup while streaming just shows literally until
  // its closing token arrives.
  function renderMarkdown(src) {
    var keep = [];
    function stash(html) { keep.push(html); return '\u0000' + (keep.length - 1) + '\u0000'; }

    var t = escapeHtml(src);

    // line-start bullets ("- " / "* ") → bullet glyph
    t = t.replace(/(^|\n)[ \t]*[-*][ \t]+/g, '$1• ');
    // inline code (protect its contents from the rules below)
    t = t.replace(/`([^`]+)`/g, function (_, c) { return stash('<code>' + c + '</code>'); });
    // markdown links [label](url) — http(s)/mailto only
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, function (_, label, url) {
      return stash('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    });
    // bare URLs (stop before trailing punctuation)
    t = t.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, function (m) {
      return stash('<a href="' + m + '" target="_blank" rel="noopener noreferrer">' + m + '</a>');
    });
    // emphasis (bold before italic)
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // restore protected spans, then line breaks
    t = t.replace(/\u0000(\d+)\u0000/g, function (_, i) { return keep[+i]; });
    return t.replace(/\n/g, '<br>');
  }

  function addMessage(who, text) {
    var row = document.createElement('div');
    row.className = 'scp-msg scp-' + who;
    // Bot replies are Markdown-rendered; user text stays literal (escaped).
    if (who === 'bot') row.innerHTML = renderMarkdown(text);
    else row.textContent = text || '';
    els.log.appendChild(row);
    scrollLog();
    return row;
  }

  function scrollLog() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (streaming) return;

    var text = (els.input.value || '').trim();
    if (!text) return;

    els.input.value = '';
    addMessage('user', text);
    history.push({ role: 'user', content: text });

    streaming = true;
    els.send.disabled = true;
    var botRow = addMessage('bot', '');
    botRow.classList.add('scp-typing');
    botRow.innerHTML = '<span class="scp-dots"><span></span><span></span><span></span></span>';

    streamReply(botRow);
  }

  function streamReply(botRow) {
    var full = '';
    var firstToken = true;

    fetch(CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) {
        if (!res.ok || !res.body) {
          return res
            .json()
            .then(function (j) { throw new Error((j && j.error) || 'Request failed.'); })
            .catch(function () { throw new Error('Request failed.'); });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) return finish();
            buffer += decoder.decode(result.value, { stream: true });

            var parts = buffer.split('\n\n');
            buffer = parts.pop(); // keep the incomplete trailing event
            for (var i = 0; i < parts.length; i++) {
              var line = parts[i].trim();
              if (line.indexOf('data:') !== 0) continue;
              var data;
              try {
                data = JSON.parse(line.slice(5).trim());
              } catch (_) {
                continue;
              }
              if (data.error) throw new Error(data.error);
              if (data.t) {
                if (firstToken) {
                  firstToken = false;
                  botRow.classList.remove('scp-typing');
                  botRow.textContent = '';
                }
                full += data.t;
                botRow.innerHTML = renderMarkdown(full);
                scrollLog();
              }
              if (data.done) return finish();
            }
            return pump();
          });
        }

        function finish() {
          if (full) history.push({ role: 'assistant', content: full });
          endStream();
        }

        return pump();
      })
      .catch(function (err) {
        botRow.classList.remove('scp-typing');
        botRow.textContent =
          (err && err.message) || 'Sorry — the assistant is unavailable right now.';
        botRow.classList.add('scp-err');
        endStream();
      });
  }

  function endStream() {
    streaming = false;
    if (els.send) els.send.disabled = false;
    scrollLog();
  }

  // ───────────────────────────── styles ───────────────────────────────

  function injectStyles() {
    if (document.getElementById('sankha-chat-style')) return;
    var reduce =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var css = [
      // Launcher (bottom-right; sits above the analytics fame badge). If it
      // overlaps that badge on your layout, bump the `bottom` value.
      '#sankha-chat-launcher{',
      'position:fixed;right:18px;bottom:18px;z-index:2147483100;',
      'width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;color:#fff;',
      'background:#2b6cb0;box-shadow:0 6px 20px rgba(0,0,0,.28);',
      (reduce ? '' : 'transition:transform .2s ease,opacity .2s ease;'),
      '}',
      '#sankha-chat-launcher:hover{transform:translateY(-2px)}',
      '#sankha-chat-launcher.scp-hidden{opacity:0;pointer-events:none;transform:scale(.8)}',

      // Panel
      '#sankha-chat-panel{',
      'position:fixed;right:18px;bottom:18px;z-index:2147483101;',
      'width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 36px);',
      'display:none;flex-direction:column;overflow:hidden;',
      'background:#fff;border-radius:14px;',
      'box-shadow:0 12px 40px rgba(0,0,0,.32);',
      'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
      'color:#1a1a1f;',
      '}',
      '#sankha-chat-panel.scp-open{display:flex}',

      '.scp-header{display:flex;align-items:center;justify-content:space-between;',
      'padding:12px 14px;background:#2b6cb0;color:#fff;flex:0 0 auto}',
      '.scp-title{font-weight:600}',
      '.scp-close{background:none;border:none;color:#fff;font-size:22px;line-height:1;',
      'cursor:pointer;padding:0 4px;opacity:.85}',
      '.scp-close:hover{opacity:1}',

      '.scp-log{flex:1 1 auto;overflow-y:auto;padding:14px;background:#f6f7f9;',
      'display:flex;flex-direction:column;gap:8px}',
      '.scp-msg{max-width:85%;padding:9px 12px;border-radius:13px;white-space:pre-wrap;',
      'word-wrap:break-word;overflow-wrap:anywhere}',
      '.scp-user{align-self:flex-end;background:#2b6cb0;color:#fff;border-bottom-right-radius:4px}',
      '.scp-bot{align-self:flex-start;background:#fff;color:#1a1a1f;',
      'border:1px solid #e4e6ea;border-bottom-left-radius:4px}',
      '.scp-err{color:#a02525;border-color:#f0c9c9;background:#fdf3f3}',
      // rendered markdown inside bot replies
      '.scp-msg strong{font-weight:600}',
      '.scp-msg em{font-style:italic}',
      '.scp-bot a{color:#2b6cb0;text-decoration:underline;word-break:break-word}',
      '.scp-bot a:hover{color:#1d4e7e}',
      '.scp-bot code{background:#eef0f3;border:1px solid #e1e4ea;border-radius:5px;',
      'padding:0 4px;font:0.92em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',

      '.scp-form{flex:0 0 auto;display:flex;align-items:flex-end;gap:8px;',
      'padding:10px;border-top:1px solid #e7e9ed;background:#fff}',
      '.scp-input{flex:1 1 auto;resize:none;max-height:120px;border:1px solid #d6d9df;',
      'border-radius:10px;padding:9px 11px;font:inherit;color:inherit;outline:none}',
      '.scp-input:focus{border-color:#2b6cb0;box-shadow:0 0 0 2px rgba(43,108,176,.15)}',
      '.scp-send{flex:0 0 auto;width:38px;height:38px;border:none;border-radius:9px;',
      'background:#2b6cb0;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.scp-send:hover{background:#255d99}',
      '.scp-send:disabled{opacity:.5;cursor:default}',

      // typing dots
      '.scp-dots{display:inline-flex;gap:4px;align-items:center}',
      '.scp-dots span{width:6px;height:6px;border-radius:50%;background:#9aa0aa;',
      (reduce ? '' : 'animation:scp-bounce 1.2s infinite ease-in-out'),
      '}',
      '.scp-dots span:nth-child(2){animation-delay:.15s}',
      '.scp-dots span:nth-child(3){animation-delay:.3s}',
      '@keyframes scp-bounce{0%,80%,100%{transform:translateY(0);opacity:.5}',
      '40%{transform:translateY(-4px);opacity:1}}',

      '@media (max-width:480px){',
      '#sankha-chat-panel{right:8px;left:8px;bottom:8px;width:auto;height:calc(100vh - 16px)}',
      '}',
      '@media print{#sankha-chat-launcher,#sankha-chat-panel{display:none!important}}'
    ].join('');

    var style = document.createElement('style');
    style.id = 'sankha-chat-style';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
