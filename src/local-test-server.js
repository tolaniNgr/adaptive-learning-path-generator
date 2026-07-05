'use strict';

// Minimal local test server used to verify the PWA shell, service worker,
// and bandwidth-aware content switching under real (throttled) network
// conditions via Playwright. This is NOT the production backend — the real
// backend (Express + MongoDB + JWT + GPT-4o integration) lives in
// src/server/ and requires real credentials to run (see README).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { renderStandardHtml, renderTextOnly } = require('./content');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PROBE_PAYLOAD = crypto.randomBytes(50 * 1024); // fixed 50 KB probe resource

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/content') {
      const mode = url.searchParams.get('mode') === 'text-only' ? 'text-only' : 'standard';
      const body = mode === 'text-only' ? renderTextOnly() : renderStandardHtml();
      const contentType = mode === 'text-only' ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(body);
      return;
    }

    if (url.pathname === '/probe/probe-payload.bin') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(PROBE_PAYLOAD);
      return;
    }

    serveStatic(req, res, url.pathname);
  });
}

if (require.main === module) {
  const port = process.env.PORT || 8090;
  createServer().listen(port, () => {
    console.log(`Local test server listening on http://localhost:${port}`);
  });
}

module.exports = { createServer };
