/**
 * export.js - Postman collection (v2.1) / OpenAPI download helpers.
 *
 * Public API (attached to window.ApiRef):
 *   ApiRef.buildPostmanCollection() -> Postman Collection v2.1 object
 *       (reads ApiRef.model and ApiRef.settings at call time)
 *   ApiRef.downloadJson(filename, obj) -> triggers a browser download
 *
 * Also wires the #btn-postman and #btn-openapi buttons once ApiRef.ready
 * resolves and the DOM is available.
 */
(function () {
  'use strict';

  const ApiRef = (window.ApiRef = window.ApiRef || {});

  /** Read a setting defensively (settings may be missing in tests). */
  function setting(key) {
    try {
      const v = ApiRef.settings && ApiRef.settings.get(key);
      return v == null ? '' : String(v);
    } catch (e) {
      return '';
    }
  }

  /** Remove the "**cURL**" section (up to the next bold heading or the end). */
  function stripCurl(text) {
    if (!text) return '';
    return String(text).replace(/\*\*cURL\*\*[\s\S]*?(?=\n\*\*[^\n]*\*\*|$)/, '').trim();
  }

  /** Pretty JSON string for an example value ('' when none). */
  function prettyJson(v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'string') {
      try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return v; }
    }
    return JSON.stringify(v, null, 2);
  }

  /** '/v1/faqs/{faq}' -> ['v1','faqs',':faq'] (Postman path variables use ':name'). */
  function pathSegments(path) {
    return String(path || '')
      .split('/')
      .filter(Boolean)
      .map(function (s) { return s.replace(/\{([^}]+)\}/g, ':$1'); });
  }

  function exampleStr(v) {
    if (v === undefined || v === null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }

  /** Build one Postman request item from an operation. */
  function buildItem(op) {
    const segs = pathSegments(op.path);
    const params = op.params || [];
    const queryParams = params.filter(function (p) { return p.in === 'query'; });
    const pathParams = params.filter(function (p) { return p.in === 'path'; });

    const query = queryParams.map(function (p) {
      const q = { key: p.name, value: exampleStr(p.example !== undefined ? p.example : p.default) , description: p.description || '' };
      // Optional params ship disabled so they are not sent until ticked in Postman.
      if (!p.required) q.disabled = true;
      return q;
    });
    // Seed value '' for disabled ones, per contract.
    query.forEach(function (q) { if (q.disabled) q.value = ''; });

    const raw = '{{base_url}}/' + segs.join('/') +
      (query.length ? '?' + query.map(function (q) { return q.key + '=' + q.value; }).join('&') : '');

    const url = {
      raw: raw,
      host: ['{{base_url}}'],
      path: segs,
      query: query,
      variable: pathParams.map(function (p) {
        return { key: p.name, value: exampleStr(p.example !== undefined ? p.example : p.default), description: p.description || '' };
      }),
    };

    const header = [{ key: 'Accept', value: 'application/json', type: 'text' }];
    let body;
    if (op.body) {
      if (op.body.contentType === 'multipart/form-data') {
        body = {
          mode: 'formdata',
          formdata: (op.body.fields || []).map(function (f) {
            const isFile = /^file/.test(f.type || '');
            const entry = { key: f.name, type: isFile ? 'file' : 'text', description: f.description || '' };
            if (isFile) entry.src = [];
            else entry.value = exampleStr(f.example);
            return entry;
          }),
        };
      } else {
        header.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
        body = {
          mode: 'raw',
          raw: prettyJson(op.body.example) || '{}',
          options: { raw: { language: 'json' } },
        };
      }
    }

    const request = {
      method: String(op.method || 'GET').toUpperCase(),
      header: header,
      url: url,
      description: stripCurl(op.description),
    };
    if (body) request.body = body;
    // Public endpoints must not inherit the collection-level bearer auth.
    if (!op.auth) request.auth = { type: 'noauth' };

    const response = (op.responses || []).map(function (r) {
      return {
        name: (r.status + ' ' + (r.description || '')).trim(),
        status: r.description || '',
        code: Number(r.status) || 0,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: prettyJson(r.example),
      };
    });

    return { name: op.summary || (request.method + ' ' + op.path), request: request, response: response };
  }

  /** Build the whole Postman v2.1 collection from ApiRef.model + current settings. */
  ApiRef.buildPostmanCollection = function () {
    const model = ApiRef.model || { info: {}, groups: [] };
    const info = model.info || {};
    return {
      info: {
        name: info.title || 'API',
        description: info.description || '',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      // Refreshed from settings on every call so the export reflects the UI.
      variable: [
        { key: 'base_url', value: setting('baseUrl') },
        { key: 'token', value: setting('token') },
      ],
      auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
      item: (model.groups || []).map(function (g) {
        return { name: g.tag, description: g.description || '', item: (g.ops || []).map(buildItem) };
      }),
    };
  };

  /** Download `obj` as a pretty-printed JSON file via a temporary <a download>. */
  ApiRef.downloadJson = function (filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  };

  /* ---------------------------- wiring ------------------------------ */

  function notify(msg) {
    if (typeof ApiRef.toast === 'function') ApiRef.toast(msg);
  }

  // File-name stem from the configured title, e.g. "Acme API" -> "acme-api".
  function fileStem() {
    var t = (window.API_REFERENCE && window.API_REFERENCE.title) || (ApiRef.model && ApiRef.model.info && ApiRef.model.info.title) || 'api';
    return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'api';
  }

  function wire() {
    const pm = document.getElementById('btn-postman');
    if (pm) {
      pm.addEventListener('click', function () {
        ApiRef.downloadJson(fileStem() + '.postman_collection.json', ApiRef.buildPostmanCollection());
        notify('Downloaded');
      });
    }
    const oa = document.getElementById('btn-openapi');
    if (oa) {
      oa.addEventListener('click', function () {
        ApiRef.downloadJson(fileStem() + '.openapi.json', ApiRef.spec || {});
        notify('Downloaded');
      });
    }
  }

  function init() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  }

  // Wire after the spec has loaded; still wire if loading failed (OpenAPI/Postman
  // buttons then export whatever is available).
  if (ApiRef.ready && typeof ApiRef.ready.then === 'function') ApiRef.ready.then(init, init);
  else init();
})();
