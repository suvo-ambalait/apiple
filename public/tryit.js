/*
 * tryit.js - "Try it" request runner (v2) + Settings popover + topbar pills.
 *
 * Classic script; loads after core.js, snippets.js, export.js and before ui.js.
 * Defines:  ApiRef.mountTryIt(op, slotEl)   (called by ui.js for each endpoint page)
 * Builds:   the #settings popover (toggled by #btn-settings, #base-pill, #token-pill)
 * Keeps up to date: #base-pill and #token-pill in the topbar.
 *
 * Depends on (core.js): ApiRef.el, copy, toast, on, ready, settings, fullUrl, methodClass.
 * Optional (snippets.js): ApiRef.buildSnippets(op, req) -> { curl, js, php }.
 * The token is never logged and the login password is never stored.
 *
 * Settings keys used (ApiRef.settings): baseUrl, token, lastTab (snippet tab),
 * userName (display name of the last login; cleared with the token).
 *
 * DOM/class names follow the shared "UI v2 contract". Extra classes beyond it:
 *   .auth-row (wrapper for the auth note), .snip-tabs (cURL/JS/PHP sub-tab bar),
 *   .settings-section / .settings-title (popover groups). All are optional hooks.
 */
(function () {
  'use strict';
  var A = window.ApiRef = window.ApiRef || {};
  var h = function () { return A.el.apply(A, arguments); };

  /* ---------- small helpers ---------- */
  function getSet(k) { try { return A.settings.get(k); } catch (e) { return ''; } }
  function putSet(k, v) { try { A.settings.set(k, v); } catch (e) { /* ignore */ } }
  function pretty(v) { try { return JSON.stringify(v, null, 2); } catch (e) { return ''; } }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function statusClass(code) {
    if (!code) return 's0';
    if (code >= 500) return 's5xx';
    if (code >= 400) return 's4xx';
    if (code >= 300) return 's3xx';
    return 's2xx';
  }
  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function isFileType(t) { return t === 'file' || t === 'file[]'; }
  function isArrayType(t) { return /^array/.test(t || '') || t === 'file[]'; }
  function exampleOf(p) {
    if (p.example !== undefined && p.example !== null) return str(p.example);
    if (p.default !== undefined && p.default !== null) return str(p.default);
    return '';
  }
  /** Code block with a copy button. Returns { wrap, pre, btn }. */
  function codeBlock(text, preClass) {
    var pre = h('pre', { class: 'code-block' + (preClass ? ' ' + preClass : '') }, text);
    var btn = h('button', { class: 'copy-btn', type: 'button', onclick: function () { A.copy(pre.textContent); } }, 'Copy');
    return { wrap: h('div', { class: 'code-wrap' }, pre, btn), pre: pre, btn: btn };
  }

  /**
   * Generic tab set. items: [{ key, label }]. Returns { bar, panels{key:el}, select(key), current() }.
   * Panels are plain `.tab-panel` elements; the caller appends them where it wants.
   */
  function tabSet(items, barClass, initial, onSelect) {
    var bar = h('div', { class: 'tabs ' + barClass, role: 'tablist' });
    var panels = {}, buttons = {}, cur = null;
    function select(key) {
      cur = key;
      Object.keys(buttons).forEach(function (k) {
        var on = k === key;
        buttons[k].classList.toggle('active', on);
        buttons[k].setAttribute('aria-selected', on ? 'true' : 'false');
        panels[k].classList.toggle('active', on);
      });
      if (onSelect) onSelect(key);
    }
    items.forEach(function (it) {
      buttons[it.key] = h('button', { class: 'tab', type: 'button', role: 'tab', onclick: function () { select(it.key); } }, it.label);
      panels[it.key] = h('div', { class: 'tab-panel', role: 'tabpanel' });
      bar.appendChild(buttons[it.key]);
    });
    select(panels[initial] ? initial : items[0].key);
    return { bar: bar, panels: panels, select: select, current: function () { return cur; } };
  }

  /* ====================================================================
   * mountTryIt - the Postman-like request/response panel
   * ==================================================================== */
  A.mountTryIt = function (op, slotEl) {
    var abort = null;
    var pathInputs = {}, queryInputs = {}, headerInputs = {};
    var bodyArea = null, formRows = [];        // formRows: [{ field, input }]
    var params = op.params || [];
    var isJson = !!(op.body && op.body.contentType !== 'multipart/form-data');
    var isMulti = !!(op.body && op.body.contentType === 'multipart/form-data');
    var curSnip = getSet('lastTab');
    if (['curl', 'js', 'php'].indexOf(curSnip) < 0) curSnip = 'curl';

    function showErr(msg) { errBox.textContent = msg || ''; errBox.hidden = !msg; }

    /* ---------- request bar: method + resolved URL + Send ---------- */
    var urlInput = h('input', { class: 'req-url mono', readonly: true, 'aria-label': 'Request URL' });
    var spinner = h('span', { class: 'spinner', hidden: true });
    var sendLabel = h('span', null, 'Send');
    var sendBtn = h('button', { class: 'btn btn-primary send-btn', type: 'button', onclick: send }, spinner, sendLabel);
    var cancelBtn = h('button', { class: 'btn btn-danger btn-small', type: 'button', hidden: true,
      onclick: function () { if (abort) abort.abort(); } }, 'Cancel');
    var reqbar = h('div', { class: 'reqbar' },
      h('span', { class: 'badge-method lg ' + A.methodClass(op.method) }, op.method.toUpperCase()),
      urlInput, sendBtn, cancelBtn);

    /* ---------- auth note (re-rendered by refresh) ---------- */
    var authHost = h('div', { class: 'auth-row' });
    var noTokenBox = h('input', { type: 'checkbox', id: 'tryit-notoken-' + op.id });
    noTokenBox.addEventListener('change', refresh);
    var noTokenRow = h('div', { class: 'form-row inline' }, noTokenBox,
      h('label', { for: 'tryit-notoken-' + op.id }, 'Send without token'));
    var errBox = h('div', { class: 'error', hidden: true });

    /* ---------- parameter inputs ---------- */
    function paramInput(p) {
      var inp;
      if (p.enum && p.enum.length) {
        inp = h('select', null);
        if (p.in !== 'path' && !p.required) inp.appendChild(h('option', { value: '' }, '(none)'));
        p.enum.forEach(function (v) { inp.appendChild(h('option', { value: str(v) }, str(v))); });
        inp.value = exampleOf(p) || (p.required ? str(p.enum[0]) : '');
      } else {
        inp = h('input', { type: 'text', value: exampleOf(p), placeholder: p.type || '', autocomplete: 'off', spellcheck: false });
      }
      inp.addEventListener('input', refresh);
      inp.addEventListener('change', refresh);
      return inp;
    }
    /** One `.param-row` card: label (name/type/required), the input, the description. */
    function paramRow(name, type, required, input, desc, extraHint) {
      var id = 'tryit-' + op.id + '-' + Math.random().toString(36).slice(2, 8);
      input.id = id;
      return h('div', { class: 'param-row' },
        h('label', { class: 'param-key', for: id },
          h('span', { class: 'field-name' }, name),
          h('span', { class: 'field-type' }, type || 'string'),
          required ? h('span', { class: 'tag-required' }, 'required') : null),
        input,
        desc ? h('p', { class: 'param-desc' }, desc) : null,
        extraHint || null);
    }

    var groups = [['path', 'Path'], ['query', 'Query'], ['header', 'Headers']];
    var paramsPanelKids = [];
    groups.forEach(function (g) {
      var list = params.filter(function (p) { return p.in === g[0]; });
      if (!list.length) return;
      var map = g[0] === 'path' ? pathInputs : g[0] === 'query' ? queryInputs : headerInputs;
      var box = h('div', { class: 'param-group' }, h('h4', { class: 'param-group-title' }, g[1]));
      list.forEach(function (p) {
        var inp = paramInput(p);
        map[p.name] = inp;
        box.appendChild(paramRow(p.name, p.type, p.required || p.in === 'path', inp, p.description));
      });
      paramsPanelKids.push(box);
    });

    /* ---------- body: JSON editor or multipart rows ---------- */
    var bodyPanelKids = [];
    function bodyExample() { return op.body.example !== undefined && op.body.example !== null ? pretty(op.body.example) : '{}'; }
    if (isJson) {
      bodyArea = h('textarea', { class: 'body-editor mono', spellcheck: false, rows: 12, 'aria-label': 'JSON request body' });
      bodyArea.value = bodyExample();
      bodyArea.addEventListener('input', refresh);
      bodyPanelKids.push(
        h('div', { class: 'param-group' },
          h('h4', { class: 'param-group-title' }, 'JSON body' + (op.body.required ? ' (required)' : '')),
          bodyArea,
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-small', type: 'button', onclick: function () {
              try { bodyArea.value = pretty(JSON.parse(bodyArea.value)); showErr(''); refresh(); }
              catch (e) { showErr('Body is not valid JSON'); }
            } }, 'Format'),
            h('button', { class: 'btn btn-small btn-secondary', type: 'button', onclick: function () {
              bodyArea.value = bodyExample(); showErr(''); refresh();
            } }, 'Reset'))));
    } else if (isMulti) {
      var mbox = h('div', { class: 'param-group' }, h('h4', { class: 'param-group-title' }, 'Form data (multipart)'));
      (op.body.fields || []).forEach(function (f) {
        var inp;
        if (isFileType(f.type)) {
          inp = h('input', { type: 'file', class: 'file-input' });
          if (f.type === 'file[]') inp.multiple = true;
        } else if (f.type === 'boolean') {
          // Booleans are sent as 1 / 0 (Laravel-friendly in multipart).
          inp = h('select', null, h('option', { value: '' }, '(none)'), h('option', { value: 'true' }, 'true'), h('option', { value: 'false' }, 'false'));
          var ex = str(f.example);
          inp.value = ex === 'true' || ex === 'false' ? ex : '';
        } else if (f.enum && f.enum.length) {
          inp = h('select', null, h('option', { value: '' }, '(none)'));
          f.enum.forEach(function (v) { inp.appendChild(h('option', { value: str(v) }, str(v))); });
          inp.value = str(f.example);
        } else {
          var ev = f.example;
          inp = h('input', { type: 'text', value: Array.isArray(ev) ? ev.join(',') : str(ev), placeholder: f.type || '', autocomplete: 'off', spellcheck: false });
        }
        inp.addEventListener('input', refresh);
        inp.addEventListener('change', refresh);
        formRows.push({ field: f, input: inp });
        mbox.appendChild(paramRow(f.name, f.type, f.required, inp, f.description,
          isArrayType(f.type) && !isFileType(f.type) ? h('p', { class: 'param-desc muted' }, 'Separate multiple values with commas.') : null));
      });
      bodyPanelKids.push(mbox);
    }

    /* ---------- tabs: only the applicable ones ---------- */
    var items = [];
    if (paramsPanelKids.length) items.push({ key: 'params', label: 'Params' });
    if (op.body && (isJson || isMulti)) items.push({ key: 'body', label: 'Body' });
    items.push({ key: 'code', label: 'Code' });
    var paneTabs = tabSet(items, 'pane-tabs', items[0].key);
    if (paneTabs.panels.params) paramsPanelKids.forEach(function (k) { paneTabs.panels.params.appendChild(k); });
    if (paneTabs.panels.body) bodyPanelKids.forEach(function (k) { paneTabs.panels.body.appendChild(k); });

    /* code tab: sub-tabs cURL / JavaScript / PHP, filled by renderSnippets() */
    var snipBar = h('div', { class: 'tabs snip-tabs' });
    var snipHost = h('div');
    paneTabs.panels.code.appendChild(snipBar);
    paneTabs.panels.code.appendChild(snipHost);

    /* ---------- response panel (always visible) ---------- */
    var respMeta = h('div', { class: 'response-meta' });
    var respEmpty = h('div', { class: 'resp-empty' }, 'Click ', h('strong', null, 'Send'), ' to see the response here.');
    var respBlock = codeBlock('', 'response-body');
    var respHeaders = h('pre', { class: 'code-block response-headers' });
    var respTabs = tabSet([{ key: 'body', label: 'Body' }, { key: 'headers', label: 'Headers' }], 'resp-tabs', 'body');
    respTabs.panels.body.appendChild(respBlock.wrap);
    respTabs.panels.headers.appendChild(respHeaders);
    var respResult = h('div', { class: 'resp-result', hidden: true }, respTabs.bar, respTabs.panels.body, respTabs.panels.headers);
    var respPanel = h('div', { class: 'resp-panel' },
      h('div', { class: 'resp-panel-head' }, h('h3', { class: 'resp-panel-title' }, 'Response'), respMeta),
      respEmpty, respResult);

    var resetBtn = h('button', { class: 'btn btn-small btn-secondary', type: 'button', onclick: reset, title: 'Restore the example values' }, 'Reset');

    var card = h('div', { class: 'tryit' },
      h('div', { class: 'tryit-head' },
        h('h3', { class: 'tryit-title' }, 'Try it'),
        h('span', { class: 'hint' }, 'Sends a real request to your API'),
        resetBtn),
      reqbar, authHost, errBox,
      paneTabs.bar,
      paneTabs.panels.params || null, paneTabs.panels.body || null, paneTabs.panels.code,
      respPanel);
    slotEl.appendChild(card);

    /* ---------- gather current form values ---------- */
    function collect() {
      var pathParams = {}, query = {}, headers = {};
      Object.keys(pathInputs).forEach(function (k) { pathParams[k] = pathInputs[k].value; });
      Object.keys(queryInputs).forEach(function (k) { var v = queryInputs[k].value; if (v !== '') query[k] = v; });
      Object.keys(headerInputs).forEach(function (k) { var v = headerInputs[k].value; if (v !== '') headers[k] = v; });
      var bodyText = null, formFields = null;
      if (isJson) bodyText = bodyArea.value;
      if (isMulti) {
        formFields = [];
        formRows.forEach(function (r) {
          var f = r.field, el = r.input;
          if (isFileType(f.type)) {
            var files = el.files ? Array.prototype.slice.call(el.files) : [];
            if (files.length) files.forEach(function (file) { formFields.push({ name: f.name, value: '', isFile: true, fileName: file.name, file: file, isArray: f.type === 'file[]' }); });
            else formFields.push({ name: f.name, value: '', isFile: true, fileName: 'file.ext', file: null, isArray: f.type === 'file[]', placeholder: true });
            return;
          }
          var v = el.value;
          if (v === '') return;                       // skip empty optional text fields
          if (f.type === 'boolean') v = v === 'true' ? '1' : '0';
          if (isArrayType(f.type)) {
            v.split(',').forEach(function (s) { s = s.trim(); if (s) formFields.push({ name: f.name + '[]', value: s, isFile: false }); });
          } else formFields.push({ name: f.name, value: v, isFile: false });
        });
      }
      return { pathParams: pathParams, query: query, headers: headers, bodyText: bodyText, formFields: formFields };
    }
    function token() { return noTokenBox.checked ? '' : (getSet('token') || ''); }
    function resolvedUrl(c) {
      try { return A.fullUrl(op, c.pathParams, c.query); } catch (e) { return str(getSet('baseUrl')) + op.path; }
    }

    /* ---------- live URL bar, auth note and snippets ---------- */
    function renderAuth() {
      var saved = !!getSet('token');
      authHost.textContent = '';
      if (!op.auth) return;                            // public endpoint: nothing to say
      if (saved) {
        authHost.appendChild(h('div', { class: 'auth-ok' }, '✓ Using saved token'));
        authHost.appendChild(noTokenRow);
      } else {
        authHost.appendChild(h('div', { class: 'callout callout-auth small' },
          'No token saved — ',
          h('button', { class: 'btn btn-small open-settings', type: 'button', onclick: function () {
            var b = document.getElementById('btn-settings'); if (b) b.click();
          } }, 'Open Settings to log in')));
      }
    }
    function refresh() {
      var c = collect();
      urlInput.value = resolvedUrl(c);
      urlInput.title = urlInput.value;
      renderAuth();
      renderSnippets(c);
    }
    function renderSnippets(c) {
      snipBar.textContent = '';
      snipHost.textContent = '';
      if (typeof A.buildSnippets !== 'function') {
        snipHost.appendChild(h('div', { class: 'muted' }, 'Code snippets are unavailable (snippets.js not loaded).'));
        return;
      }
      var snips;
      try {
        // File inputs: snippets only need name/fileName; strip the File object.
        var ff = c.formFields && c.formFields.map(function (f) { return { name: f.name, value: f.value, isFile: f.isFile, fileName: f.fileName }; });
        snips = A.buildSnippets(op, { baseUrl: getSet('baseUrl'), token: token(), pathParams: c.pathParams, query: c.query,
          headers: Object.assign({}, c.headers), contentType: op.body ? op.body.contentType : null, bodyText: c.bodyText, formFields: ff || null });
      } catch (e) { snipHost.appendChild(h('div', { class: 'muted' }, 'Could not build snippets: ' + e.message)); return; }
      [['curl', 'cURL'], ['js', 'JavaScript'], ['php', 'PHP']].forEach(function (t) {
        snipBar.appendChild(h('button', { class: 'tab' + (curSnip === t[0] ? ' active' : ''), type: 'button', onclick: function () {
          curSnip = t[0]; putSet('lastTab', curSnip); renderSnippets(collect());
        } }, t[1]));
        snipHost.appendChild(h('div', { class: 'tab-panel' + (curSnip === t[0] ? ' active' : '') }, codeBlock(str(snips && snips[t[0]])).wrap));
      });
    }

    function findParam(where, name) {
      for (var i = 0; i < params.length; i++) if (params[i].in === where && params[i].name === name) return params[i];
      return null;
    }
    /** Restore every input to its example/default value. */
    function reset() {
      [['path', pathInputs], ['query', queryInputs], ['header', headerInputs]].forEach(function (g) {
        Object.keys(g[1]).forEach(function (k) { g[1][k].value = exampleOf(findParam(g[0], k) || {}); });
      });
      if (bodyArea) bodyArea.value = bodyExample();
      formRows.forEach(function (r) {
        var f = r.field;
        if (isFileType(f.type)) { try { r.input.value = ''; } catch (e) { /* ignore */ } }
        else if (r.input.tagName === 'SELECT') r.input.value = str(f.example);
        else r.input.value = Array.isArray(f.example) ? f.example.join(',') : str(f.example);
      });
      noTokenBox.checked = false;
      showErr('');
      refresh();
    }

    /* ---------- send ---------- */
    function setBusy(b) { sendBtn.disabled = b; spinner.hidden = !b; sendLabel.textContent = b ? 'Sending…' : 'Send'; cancelBtn.hidden = !b; }

    function send() {
      showErr('');
      var c = collect();
      for (var k in pathInputs) {
        if (!String(c.pathParams[k]).trim()) {
          showErr('Path parameter "' + k + '" is required');
          if (paneTabs.panels.params) paneTabs.select('params');
          return;
        }
      }
      var init = { method: op.method.toUpperCase(), headers: { Accept: 'application/json' } };
      var tk = token();
      if (tk) init.headers.Authorization = 'Bearer ' + tk;
      Object.keys(c.headers).forEach(function (n) { init.headers[n] = c.headers[n]; });

      if (isJson) {
        var txt = c.bodyText;
        if (txt && txt.trim()) {
          try { JSON.parse(txt); } catch (e) { showErr('Body is not valid JSON'); paneTabs.select('body'); return; }
          init.headers['Content-Type'] = 'application/json';
          init.body = txt;
        } else if (op.body.required) { showErr('Body is not valid JSON'); paneTabs.select('body'); return; }
      } else if (isMulti) {
        var fd = new FormData();
        c.formFields.forEach(function (f) {
          if (f.isFile) {
            if (!f.file) return;
            fd.append(f.isArray ? f.name + '[]' : f.name, f.file, f.file.name);
          } else fd.append(f.name, f.value);
        });
        init.body = fd;                               // browser sets multipart boundary
      }

      var url = resolvedUrl(c);
      abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (abort) init.signal = abort.signal;
      setBusy(true);
      var t0 = performance.now();
      fetch(url, init).then(function (res) {
        return res.arrayBuffer().then(function (buf) { return { res: res, buf: buf, ms: performance.now() - t0 }; });
      }).then(function (r) {
        showResponse(r.res, r.buf, r.ms);
      }).catch(function (e) {
        var cancelled = e && e.name === 'AbortError';
        showFailure(cancelled ? 'Request cancelled.' : 'Request failed: ' + (e && e.message ? e.message : e) + '. Check the base URL in Settings', performance.now() - t0);
      }).then(function () { setBusy(false); abort = null; });
    }

    /* ---------- response rendering ---------- */
    function revealResult() {
      respEmpty.hidden = true;
      respResult.hidden = false;
      respTabs.select('body');
      // Bring the response into view if it is (partly) off-screen.
      try {
        var r = respPanel.getBoundingClientRect();
        if (r.top < 0 || r.bottom > (window.innerHeight || document.documentElement.clientHeight)) {
          respPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } catch (e) { /* ignore */ }
    }
    function metaHead(code, text, ms, size) {
      respMeta.textContent = '';
      respMeta.appendChild(h('span', { class: 'status ' + statusClass(code) }, String(code || 'ERR') + (text ? ' ' + text : '')));
      respMeta.appendChild(h('span', { class: 'muted' }, Math.round(ms) + ' ms' + (size !== null ? ' · ' + fmtBytes(size) : '')));
    }
    function setBody(text, copyable) {
      respBlock.pre.textContent = text;
      respBlock.btn.hidden = !copyable;
    }
    function showFailure(msg, ms) {
      metaHead(0, 'Network error', ms, null);
      respHeaders.textContent = '(no response headers)';
      setBody(msg, false);
      revealResult();
    }
    function showResponse(res, buf, ms) {
      metaHead(res.status, res.statusText || '', ms, buf.byteLength);
      var hdrs = [];
      res.headers.forEach(function (v, n) { hdrs.push(n + ': ' + v); });
      respHeaders.textContent = hdrs.join('\n') || '(no headers)';
      var ct = res.headers.get('content-type') || '';
      if (/^image\/|octet-stream|application\/pdf|^audio\/|^video\//i.test(ct)) {
        setBody('Binary response (' + (ct || 'unknown type') + ', ' + fmtBytes(buf.byteLength) + ') not displayed.', false);
      } else {
        var text = '';
        try { text = new TextDecoder('utf-8').decode(buf); } catch (e) { text = ''; }
        if (/json/i.test(ct) || /^\s*[\[{]/.test(text)) {
          try { text = pretty(JSON.parse(text)); } catch (e) { /* leave as text */ }
        }
        if (text) setBody(text, true); else setBody('(empty body)', false);
      }
      revealResult();
    }

    A.on && A.on('settings', refresh);
    refresh();
  };

  /* ====================================================================
   * Settings popover + topbar pills
   * ==================================================================== */
  function buildSettings() {
    var pop = document.getElementById('settings');
    var btn = document.getElementById('btn-settings');
    var basePill = document.getElementById('base-pill');
    var tokenPill = document.getElementById('token-pill');
    if (!pop || pop.getAttribute('data-built')) return;
    pop.setAttribute('data-built', '1');

    /* ---- topbar pills: keep in sync with stored settings ---- */
    function updatePills() {
      var base = str(getSet('baseUrl'));
      if (basePill) {
        // Show just the server address (host[:port]); the full URL is in the tooltip and in Settings.
        var host = base;
        try { host = new URL(base).host; } catch (e) { host = base.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0]; }
        basePill.textContent = host ? 'Server · ' + host : 'Set base URL';
        basePill.title = (base || 'No base URL') + ' — click to change';
      }
      if (tokenPill) {
        var has = !!getSet('token');
        var who = str(getSet('userName'));
        tokenPill.className = 'pill ' + (has ? 'ok' : 'none');
        tokenPill.textContent = has ? 'Token saved' + (who ? ' · ' + who : '') : 'No token';
      }
    }

    /* ---- Server: base URL ---- */
    var baseInp = h('input', { type: 'text', placeholder: 'https://host/api', autocomplete: 'off', spellcheck: false });
    function showBase() { baseInp.value = getSet('baseUrl') || ''; }
    function saveBase() {
      var v = baseInp.value.trim().replace(/\/+$/, '');
      if (v !== str(getSet('baseUrl'))) putSet('baseUrl', v);
      showBase();
    }
    baseInp.addEventListener('change', saveBase);
    baseInp.addEventListener('blur', saveBase);
    baseInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveBase(); });
    var resetBase = h('button', { class: 'btn btn-secondary', type: 'button', title: 'Use the default base URL', onclick: function () {
      putSet('baseUrl', ''); showBase(); // empty stored value -> core falls back to the default
    } }, 'Reset');

    /* ---- Authentication: token ---- */
    var tokInp = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Paste a Bearer token', spellcheck: false });
    // Signed-in card (shown when a token is stored) + the helpers that keep it in sync.
    var avatar = h('div', { class: 'avatar', 'aria-hidden': 'true' });
    var whoName = h('div', { class: 'auth-name' });
    var whoSub = h('div', { class: 'auth-sub' });
    var logoutBtn = h('button', { class: 'btn btn-small btn-secondary', type: 'button', onclick: function () {
      putSet('userName', ''); putSet('token', ''); tokInp.value = ''; showTok(); msg('', ''); if (A.toast) A.toast('Logged out (token removed)');
    } }, 'Log out');
    var authCard = h('div', { class: 'auth-card', hidden: true }, avatar, h('div', { class: 'auth-who' }, whoName, whoSub), logoutBtn);
    var loginMore = h('details', { class: 'settings-more' });
    var tokenMore = h('details', { class: 'settings-more' });
    var lastHas = null;
    var loginLabel = h('span');
    function initials(name) {
      var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    }
    function showTok() {
      var has = !!getSet('token');
      var who = str(getSet('userName'));
      authCard.hidden = !has;
      loginLabel.textContent = has ? 'Log in with a different account' : 'Log in';
      avatar.textContent = initials(who || 'Token');
      whoName.textContent = who || 'Token saved';
      whoSub.textContent = who ? 'Logged in · token is kept in this browser only' : 'Token is kept in this browser only';
      // Open the login form when signed out; fold it away once signed in (only on a change, so typing is never interrupted).
      if (lastHas !== has) { loginMore.open = !has; lastHas = has; }
    }
    var toggle = h('button', { class: 'btn btn-secondary', type: 'button', onclick: function () {
      var show = tokInp.type === 'password';
      tokInp.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
    } }, 'Show');
    var saveTok = h('button', { class: 'btn btn-primary', type: 'button', onclick: function () {
      var v = tokInp.value.trim();
      putSet('userName', '');                    // a pasted token has no known user
      putSet('token', v); tokInp.value = ''; showTok();
      if (A.toast) A.toast(v ? 'Token saved' : 'Nothing to save');
    } }, 'Save token');

    /* ---- Authentication: login helper (POST {baseUrl}/{login.endpoint}) ----
       Configurable through window.API_REFERENCE.login (see config/api-reference.php). */
    var LOGIN = (window.API_REFERENCE && window.API_REFERENCE.login) || {};
    var L_ENDPOINT = String(LOGIN.endpoint || 'v1/auth/login').replace(/^\/+/, '');
    var L_USER = LOGIN.username_field || 'username';
    var L_PASS = LOGIN.password_field || 'password';
    var L_LABEL = LOGIN.username_label || 'Username or email';
    function dig(obj, path) {   // 'data.token' -> obj.data.token
      return String(path || '').split('.').filter(Boolean).reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
    }
    var user = h('input', { type: 'text', autocomplete: 'username', placeholder: L_LABEL });
    var pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password' });
    var loginMsg = h('div', { class: 'login-msg', hidden: true });
    var loginBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: doLogin }, 'Log in & save token');
    [user, pass].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); });

    function msg(cls, text) { loginMsg.className = 'login-msg ' + cls; loginMsg.textContent = text; loginMsg.hidden = !text; }
    function doLogin() {
      var u = user.value.trim(), p = pass.value;
      if (!u || !p) { msg('error', 'Enter username and password'); return; }
      loginBtn.disabled = true; msg('muted', 'Logging in…');
      var base = (getSet('baseUrl') || '').replace(/\/+$/, '');
      fetch(base + '/' + L_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify((function () { var o = {}; o[L_USER] = u; o[L_PASS] = p; return o; })())
      }).then(function (res) {
        return res.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) { /* non-JSON */ } return { ok: res.ok, status: res.status, j: j }; });
      }).then(function (r) {
        // Token may be at data.token or token.
        var d = r.j && r.j.data && typeof r.j.data === 'object' ? r.j.data : (r.j || {});
        var tk = (LOGIN.token_path && dig(r.j, LOGIN.token_path)) || d.token || (r.j && r.j.token);
        if (r.ok && tk) {
          var usr = (LOGIN.user_path && dig(r.j, LOGIN.user_path)) || d.user || (r.j && r.j.user) || {};
          var who = [usr.first_name, usr.last_name].filter(Boolean).join(' ') || usr.name || u;
          putSet('userName', who);
          putSet('token', tk); tokInp.value = ''; showTok();
          msg('success', 'Logged in as ' + who + (usr.role ? ' (' + (usr.role.name || usr.role) + ')' : ''));
          pass.value = '';                       // never keep the password
          if (A.toast) A.toast('Logged in');
          return;
        }
        var text = (r.j && r.j.message) || ('Login failed (HTTP ' + r.status + ')');
        if (r.j && r.j.errors && typeof r.j.errors === 'object') {
          var lines = [];
          Object.keys(r.j.errors).forEach(function (k) { [].concat(r.j.errors[k]).forEach(function (m) { lines.push(m); }); });
          if (lines.length) text += ' ' + lines.join(' ');
        }
        if (r.ok && !tk) text = 'Login response had no token.';
        msg('error', text);
      }).catch(function (e) {
        msg('error', 'Request failed: ' + (e && e.message ? e.message : e) + '. Check the base URL above');
      }).then(function () { loginBtn.disabled = false; });
    }

    /* ---- assemble the popover ---- */
    function fr(label, input, extra) {
      return h('div', { class: 'form-row' }, h('label', null, label), input, extra || null);
    }
    function summary(label) { return h('summary', null, h('span', { class: 'chev' }), label); }

    loginMore.appendChild(summary(loginLabel));
    loginMore.appendChild(h('div', { class: 'settings-more-body' },
      fr(L_LABEL, user), fr('Password', pass),
      loginBtn, loginMsg,
      h('div', { class: 'hint' }, 'Your password is never stored; only the returned token is saved.')));
    tokenMore.appendChild(summary('Use a token instead'));
    tokenMore.appendChild(h('div', { class: 'settings-more-body' },
      fr('Bearer token', h('div', { class: 'input-group' }, tokInp, toggle)),
      saveTok));

    var closeBtn = h('button', { class: 'popover-close', type: 'button', 'aria-label': 'Close settings', onclick: function () { setOpen(false); } }, '×');
    pop.textContent = '';
    pop.appendChild(h('div', { class: 'popover-head' }, h('h3', { class: 'popover-title' }, 'Settings'), closeBtn));
    pop.appendChild(h('section', { class: 'settings-section' },
      h('h4', { class: 'settings-title' }, 'Server'),
      fr('Base URL', h('div', { class: 'input-group' }, baseInp, resetBase)),
      h('div', { class: 'hint' }, 'Where "Try it" requests are sent, for example https://your-host/api. Endpoint paths like /v1/faqs are added to it.')));
    pop.appendChild(h('section', { class: 'settings-section' },
      h('h4', { class: 'settings-title' }, 'Authentication'),
      h('div', { class: 'hint' }, 'Most endpoints need a Bearer token. Log in once and every Try it request uses it automatically.'),
      authCard, loginMore, tokenMore));

    showBase(); showTok(); updatePills();
    if (A.on) A.on('settings', function () {
      if (document.activeElement !== baseInp) showBase();
      showTok(); updatePills();
    });
    // The default base URL comes from the spec, which loads asynchronously.
    if (A.ready && A.ready.then) A.ready.then(function () { showBase(); updatePills(); }, function () { /* ignore */ });

    /* ---- open / close (Esc and outside click close it) ---- */
    var triggers = [btn, basePill, tokenPill].filter(Boolean);
    function setOpen(o) { if (o) { showBase(); showTok(); } pop.hidden = !o; }
    triggers.forEach(function (t) {
      t.addEventListener('click', function (e) { e.stopPropagation(); setOpen(pop.hidden); });
    });
    document.addEventListener('click', function (e) {
      if (pop.hidden) return;
      if (pop.contains(e.target) || triggers.some(function (t) { return t.contains(e.target); })) return;
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) setOpen(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSettings);
  else buildSettings();
})();
