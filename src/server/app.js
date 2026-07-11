'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const enrollmentRoutes = require('./routes/enrollments');

function createApp() {
  const app = express();

  // Security headers (Section 3.8): sensible defaults against common
  // injection/clickjacking vectors, appropriate for an API serving a PWA.
  app.use(helmet());

  // The PWA is served from the same origin in production (see static
  // file serving below); CORS is restricted to that origin, with
  // credentials enabled so the httpOnly auth cookie is sent correctly.
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
      credentials: true,
    })
  );

  app.use(express.json({ limit: '100kb' })); // learner submissions are small; caps abuse
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/enrollments', enrollmentRoutes);

  // Serve the PWA shell (index.html, app.js, sw.js, manifest.json, etc.)
  // from the same origin and port as the API, so there is exactly one
  // server to run in production: `npm start`.
  const publicDir = path.join(__dirname, '..', '..', 'public');
  app.use(express.static(publicDir));

  // Centralised error handler: never leak stack traces to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}

module.exports = { createApp };

