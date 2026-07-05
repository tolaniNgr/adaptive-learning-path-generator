'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const LearnerProfile = require('../models/LearnerProfile');
const ContentModule = require('../models/ContentModule');
const { generateModulesForSubject } = require('../services/aiContentGenerator');
const { initialiseLearnerProfile } = require('../../adaptive-engine');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();
const BCRYPT_COST_FACTOR = 10;

/**
 * POST /api/auth/register
 * Body: { email, password, subject, diagnosticScore }
 *
 * Registration flow:
 *   1. Create the user account (password hashed with bcrypt).
 *   2. Generate the subject's 9 modules via GPT-4o (one-time AI call, Section 3.7.6).
 *      If generation fails, the learner is notified and no profile is created
 *      (Chapter 1: "if AI generation fails at registration, the system
 *      notifies the learner and retries" — retry is left to the client, which
 *      may resubmit registration).
 *   3. Classify proficiency and generate the initial path using the SAME
 *      rule-based engine (src/adaptive-engine.js) used client-side, so the
 *      server-persisted profile and the client's offline copy start identical.
 */
router.post('/register', async (req, res) => {
  const { email, password, subject, diagnosticScore } = req.body;

  if (!email || !password || !subject || typeof diagnosticScore !== 'number') {
    return res.status(400).json({ error: 'email, password, subject, and diagnosticScore are required.' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  let generatedModules;
  try {
    generatedModules = await generateModulesForSubject(subject);
  } catch (err) {
    // AI generation failure: notify the learner rather than creating a
    // half-registered account with no content (Chapter 1, Limitations).
    return res.status(502).json({
      error: 'Content generation failed. Please try registering again in a moment.',
      detail: err.message,
    });
  }

  await ContentModule.insertMany(generatedModules, { ordered: false }).catch((err) => {
    // Ignore duplicate-key errors from a retried registration for the same subject;
    // surface anything else.
    if (err.code !== 11000) throw err;
  });

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
  const user = await User.create({ email: email.toLowerCase(), passwordHash, subject });

  const enginePofile = initialiseLearnerProfile(user._id.toString(), diagnosticScore, subject);
  const profile = await LearnerProfile.create({
    userId: user._id,
    proficiencyLevel: enginePofile.proficiencyLevel,
    currentPath: enginePofile.currentPath,
    completedModules: [],
    diagnosticScore,
    lastAssessmentScore: null,
  });

  const token = signToken(user);
  setAuthCookie(res, token);

  res.status(201).json({
    user: { id: user._id, email: user.email, subject: user.subject },
    profile,
  });
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
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
  res.json({ user: { id: user._id, email: user.email, subject: user.subject } });
});

/**
 * POST /api/auth/logout
 * Clears the auth cookie. Client-side, the session logout function (Section
 * 3.8) additionally clears localStorage and the service worker cache.
 */
router.post('/logout', requireAuth, (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

module.exports = router;
