'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
const BCRYPT_COST_FACTOR = 10;

/**
 * POST /api/auth/register
 * Body: { email, password }
 *
 * Registration now creates only the account. Subject enrollment (and the
 * AI-generated diagnostic quiz that comes with it) is a separate step via
 * POST /api/enrollments, so a single account can take multiple courses
 * without registering again for each one.
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const user = await User.create({ email: email.toLowerCase(), passwordHash });

    const token = signToken(user);
    setAuthCookie(res, token);

    res.status(201).json({ user: { id: user._id, email: user.email } });
  })
);

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: { id: user._id, email: user.email } });
  })
);

/**
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

/**
 * GET /api/auth/me
 * Confirms whether the current session is authenticated. Per-subject
 * status now lives under /api/enrollments, not here.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

module.exports = router;
