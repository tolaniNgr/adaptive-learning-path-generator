'use strict';

/**
 * TEST-ONLY real HTTP server for end-to-end browser verification.
 *
 * Unlike tests/backend-integration.test.js (which calls route handlers
 * in-process via simulateRequest), this stands up an actual TCP server
 * so a real browser (via Playwright) can load the actual public/ files
 * and make actual HTTP requests to the actual route files in
 * src/server/routes — the same code, exercised the way a real browser
 * exercises it, including real cookie headers and real static file
 * serving. Only MongoDB, the OpenAI network call, and the native
 * bcrypt/jsonwebtoken bindings are substituted (see node_modules/*
 * fakes) — everything else is the real path.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROBE_PAYLOAD = crypto.randomBytes(50 * 1024); // matches bandwidth-monitor.js PROBE_RESOURCE_BYTES

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  });
  return cookies;
}

function startRealServer(app, publicDir, port) {
  const server = http.createServer((req, res) => {
    const [pathname, queryString] = req.url.split('?');

    if (pathname.startsWith('/api/')) {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        let body = {};
        try {
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        } catch (err) {
          /* empty or non-JSON body */
        }

        const query = {};
        if (queryString) {
          queryString.split('&').forEach((pair) => {
            const [k, v] = pair.split('=');
            query[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
        }

        const layer = app.__layers.find((l) => l.method === req.method && l.matcher.regex.test(pathname));
        if (!layer) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: `No route for ${req.method} ${pathname}` }));
          return;
        }
        const match = layer.matcher.regex.exec(pathname);
        const params = {};
        layer.matcher.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        const setCookies = [];
        let statusCode = 200;
        const fakeReq = { body, params, query, cookies: parseCookies(req.headers.cookie) };
        const fakeRes = {
          status(code) {
            statusCode = code;
            return fakeRes;
          },
          json(payload) {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
            res.end(JSON.stringify(payload));
            return fakeRes;
          },
          end() {
            res.statusCode = statusCode;
            if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
            res.end();
            return fakeRes;
          },
          cookie(name, value, opts = {}) {
            let str = `${name}=${encodeURIComponent(value)}`;
            if (opts.path) str += `; Path=${opts.path}`;
            if (opts.httpOnly) str += '; HttpOnly';
            if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
            if (opts.maxAge) str += `; Max-Age=${Math.floor(opts.maxAge / 1000)}`;
            setCookies.push(str);
            return fakeRes;
          },
          clearCookie(name, opts = {}) {
            setCookies.push(`${name}=; Path=${opts.path || '/'}; Max-Age=0`);
            return fakeRes;
          },
        };

        let i = 0;
        async function next(err) {
          if (err) {
            statusCode = 500;
            fakeRes.json({ error: err.message });
            return;
          }
          const handler = layer.handlers[i++];
          if (!handler) return;
          try {
            await handler(fakeReq, fakeRes, next);
          } catch (e) {
            statusCode = 500;
            fakeRes.json({ error: e.message });
          }
        }
        await next();
      });
      return;
    }

    if (pathname === '/probe/probe-payload.bin') {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(PROBE_PAYLOAD);
      return;
    }

    // Real static file serving for the PWA shell.
    const urlPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(publicDir, urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

module.exports = { startRealServer };
