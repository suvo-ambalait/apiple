/**
 * snippets.js - code-sample generators for the API Reference "Try it" panel.
 *
 * Pure functions (no DOM, no network, no dependency on core.js) so they can be
 * unit-tested under node with a stubbed `window`.
 *
 * Public API (attached to window.ApiRef):
 *   ApiRef.buildSnippets(op, req) -> { curl, js, php }
 *   ApiRef.jsonToPhp(value, indent) -> string   (JSON value -> PHP short-array literal)
 *
 * `req` shape:
 *   { baseUrl, token, pathParams:{}, query:{}, headers:{},
 *     contentType: 'application/json' | 'multipart/form-data' | null,
 *     bodyText: string|null,                       // raw JSON text
 *     formFields: null | [{ name, value, isFile, fileName }] }
 */
(function () {
  'use strict';

  const ApiRef = (window.ApiRef = window.ApiRef || {});

  /* ------------------------------------------------------------------ */
  /* Shared helpers                                                      */
  /* ------------------------------------------------------------------ */

  /** True when a value counts as "not provided" (skipped in the query string). */
  function isEmpty(v) {
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  }

  /**
   * Build the final URL: baseUrl + path (with {param} substituted) + query.
   * Missing path params keep their `{param}` placeholder. Array query values
   * are repeated as `key[]=a&key[]=b`.
   */
  function buildUrl(op, req) {
    const base = String(req.baseUrl || '').replace(/\/+$/, '');
    const pathParams = req.pathParams || {};
    const path = String(op.path || '').replace(/\{([^}]+)\}/g, function (m, name) {
      const v = pathParams[name];
      return isEmpty(v) ? m : encodeURIComponent(String(v));
    });
    const parts = [];
    const query = req.query || {};
    Object.keys(query).forEach(function (k) {
      const v = query[k];
      if (isEmpty(v)) return;
      if (Array.isArray(v)) {
        v.forEach(function (item) {
          parts.push(encodeURIComponent(k) + '[]=' + encodeURIComponent(String(item)));
        });
      } else {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
      }
    });
    return base + path + (parts.length ? '?' + parts.join('&') : '');
  }

  /** Parse JSON text; returns { ok, value }. */
  function tryParse(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, value: null };
    }
  }

  function hasJsonBody(req) {
    return req.contentType === 'application/json' && typeof req.bodyText === 'string' && req.bodyText.trim() !== '';
  }

  function hasFormBody(req) {
    return req.contentType === 'multipart/form-data' && Array.isArray(req.formFields) && req.formFields.length > 0;
  }

  /**
   * Headers shown in every snippet, in order: Accept, Authorization (only with
   * a token), Content-Type (JSON bodies only; multipart is set by the client
   * so the boundary is correct), then user-supplied extras.
   * Returns [[name, value], ...].
   */
  function collectHeaders(req) {
    const out = [['Accept', 'application/json']];
    if (req.token) out.push(['Authorization', 'Bearer ' + req.token]);
    if (hasJsonBody(req)) out.push(['Content-Type', 'application/json']);
    const extra = req.headers || {};
    Object.keys(extra).forEach(function (k) {
      if (isEmpty(extra[k])) return;
      const lower = k.toLowerCase();
      if (lower === 'accept' || lower === 'authorization' || lower === 'content-type') return;
      out.push([k, String(extra[k])]);
    });
    return out;
  }

  /** Pretty-print JSON text when valid; otherwise return it untouched. */
  function prettyBody(text) {
    const p = tryParse(text);
    return p.ok ? JSON.stringify(p.value, null, 2) : text;
  }

  function filePath(f) {
    return '/path/to/' + (f.fileName || 'file.jpg');
  }

  /* ------------------------------------------------------------------ */
  /* cURL                                                                */
  /* ------------------------------------------------------------------ */

  /** Single-quote for POSIX shell: ' becomes '\'' */
  function shSingle(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  /** Escape for use inside a double-quoted shell string. */
  function shDouble(s) {
    return '"' + String(s).replace(/(["\\$`])/g, '\\$1') + '"';
  }

  function buildCurl(op, req, url) {
    const method = String(op.method || 'GET').toUpperCase();
    const lines = [];
    // -g disables curl's [] globbing, needed for `key[]=` query params.
    const globOff = /[\[\]]/.test(url) ? '-g ' : '';
    lines.push('curl ' + globOff + (method !== 'GET' ? '-X ' + method + ' ' : '') + shSingle(url));
    collectHeaders(req).forEach(function (h) {
      lines.push('-H ' + shDouble(h[0] + ': ' + h[1]));
    });
    if (hasJsonBody(req)) {
      lines.push('-d ' + shSingle(prettyBody(req.bodyText)));
    } else if (hasFormBody(req)) {
      req.formFields.forEach(function (f) {
        if (f.isFile) lines.push('-F ' + shDouble(f.name + '=@' + filePath(f)));
        else lines.push('-F ' + shDouble(f.name + '=' + (f.value == null ? '' : f.value)));
      });
    }
    return lines.join(' \\\n  ');
  }

  /* ------------------------------------------------------------------ */
  /* JavaScript (fetch)                                                  */
  /* ------------------------------------------------------------------ */

  /** Single-quoted JS string literal. */
  function jsStr(s) {
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
  }

  /** Indent every line after the first by `pad`. */
  function indentRest(text, pad) {
    return text.split('\n').join('\n' + pad);
  }

  function buildJs(op, req, url) {
    const method = String(op.method || 'GET').toUpperCase();
    const out = [];
    out.push('const url = ' + jsStr(url) + ';');
    out.push('');

    const isForm = hasFormBody(req);
    if (isForm) {
      out.push('const form = new FormData();');
      req.formFields.forEach(function (f) {
        if (f.isFile) {
          out.push('form.append(' + jsStr(f.name) + ', fileInput.files[0]); // <input type="file">, or: new File([blob], ' + jsStr(f.fileName || 'file.jpg') + ')');
        } else {
          out.push('form.append(' + jsStr(f.name) + ', ' + jsStr(f.value == null ? '' : f.value) + ');');
        }
      });
      out.push('');
    }

    const headers = collectHeaders(req);
    const opts = [];
    opts.push('  method: ' + jsStr(method) + ',');
    opts.push('  headers: {');
    headers.forEach(function (h) {
      opts.push('    ' + jsStr(h[0]) + ': ' + jsStr(h[1]) + ',');
    });
    opts.push('  },');
    if (hasJsonBody(req)) {
      const p = tryParse(req.bodyText);
      if (p.ok) {
        opts.push('  body: JSON.stringify(' + indentRest(JSON.stringify(p.value, null, 2), '  ') + '),');
      } else {
        opts.push('  body: ' + jsStr(req.bodyText) + ', // not valid JSON, sent as-is');
      }
    } else if (isForm) {
      opts.push('  body: form, // do not set Content-Type manually; the browser adds the boundary');
    }

    out.push('const res = await fetch(url, {');
    out.push(opts.join('\n'));
    out.push('});');
    out.push('');
    out.push('const data = await res.json();');
    out.push('console.log(res.status, data);');
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* PHP (Guzzle)                                                        */
  /* ------------------------------------------------------------------ */

  /** Single-quoted PHP string literal (only \ and ' need escaping). */
  function phpStr(s) {
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  /**
   * Convert a JSON value to a PHP short-array literal.
   * @param {*} value   parsed JSON value
   * @param {number|string} [indent=0]  current indentation (spaces count or string);
   *   nested lines are indented 4 spaces deeper.
   */
  function jsonToPhp(value, indent) {
    const cur = typeof indent === 'string' ? indent : ' '.repeat(indent || 0);
    const next = cur + '    ';
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
    if (typeof value === 'string') return phpStr(value);
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      return '[\n' + value.map(function (v) { return next + jsonToPhp(v, next) + ','; }).join('\n') + '\n' + cur + ']';
    }
    const keys = Object.keys(value);
    if (!keys.length) return '[]';
    return '[\n' + keys.map(function (k) {
      return next + phpStr(k) + ' => ' + jsonToPhp(value[k], next) + ',';
    }).join('\n') + '\n' + cur + ']';
  }

  function buildPhp(op, req, url) {
    const method = String(op.method || 'GET').toUpperCase();
    const out = [];
    out.push('use GuzzleHttp\\Client;');
    out.push('');
    out.push('$client = new Client();');
    out.push('');
    out.push('$response = $client->request(' + phpStr(method) + ', ' + phpStr(url) + ', [');
    out.push('    ' + "'headers' => [");
    collectHeaders(req).forEach(function (h) {
      // For JSON bodies Guzzle's 'json' option sets Content-Type itself.
      if (h[0] === 'Content-Type') return;
      out.push('        ' + phpStr(h[0]) + ' => ' + phpStr(h[1]) + ',');
    });
    out.push('    ],');
    if (hasJsonBody(req)) {
      const p = tryParse(req.bodyText);
      if (p.ok) {
        out.push("    'json' => " + jsonToPhp(p.value, 4) + ',');
      } else {
        out.push("    'body' => " + phpStr(req.bodyText) + ', // not valid JSON, sent as-is');
      }
    } else if (hasFormBody(req)) {
      out.push("    'multipart' => [");
      req.formFields.forEach(function (f) {
        const contents = f.isFile ? "fopen(" + phpStr(filePath(f)) + ", 'r')" : phpStr(f.value == null ? '' : f.value);
        let part = '        [' + "'name' => " + phpStr(f.name) + ", 'contents' => " + contents;
        if (f.isFile) part += ", 'filename' => " + phpStr(f.fileName || 'file.jpg');
        out.push(part + '],');
      });
      out.push('    ],');
    }
    out.push("    'http_errors' => false, // return 4xx/5xx responses instead of throwing");
    out.push(']);');
    out.push('');
    out.push('echo $response->getStatusCode();');
    out.push('echo $response->getBody();');
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  /** Build cURL / fetch / Guzzle snippets for an operation and request state. */
  ApiRef.buildSnippets = function (op, req) {
    req = req || {};
    const url = buildUrl(op, req);
    return {
      curl: buildCurl(op, req, url),
      js: buildJs(op, req, url),
      php: buildPhp(op, req, url),
    };
  };
  ApiRef.jsonToPhp = jsonToPhp;
})();
