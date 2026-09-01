'use strict';

const express = require('express');
const ContentModule = require('../models/ContentModule');
const Enrollment = require('../models/Enrollment');
const { getAccessibleModules } = require('../../adaptive-engine');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

/**
 * GET /api/content/:moduleId?mode=standard|text-only
 *
 * Serves the field matching the client's bandwidth-detected mode
 * (public/bandwidth-monitor.js, Section 3.7.4). The mode query parameter
 * is set by the client after its own probe measurement; the server does
 * not re-measure bandwidth, since only the client has visibility into the
 * learner's actual last-mile connection.
 *
 * Ownership check: requireAuth alone only proves the caller is SOME
 * logged-in user, not that this module is currently unlocked for them —
 * without this, any account could fetch any module ID directly and
 * bypass the section-gating the adaptive engine is built around. A
 * module counts as accessible if it appears in getAccessibleModules() for
 * any of the caller's own enrollments.
 */
router.get('/:moduleId', requireAuth, asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const mode = req.query.mode === 'text-only' ? 'text-only' : 'standard';

  const enrollments = await Enrollment.find({ userId: req.userId, diagnosticCompleted: true });
  const isAccessible = enrollments.some((enrollment) => getAccessibleModules(enrollment).includes(moduleId));
  if (!isAccessible) {
    return res.status(403).json({ error: 'This module is not currently accessible to your account.' });
  }

  const contentModule = await ContentModule.findOne({ moduleId });
  if (!contentModule) {
    return res.status(404).json({ error: `Module '${moduleId}' not found.` });
  }

  res.json({
    moduleId: contentModule.moduleId,
    level: contentModule.level,
    sequence: contentModule.sequence,
    mode,
    content: mode === 'text-only' ? contentModule.contentTextOnly : contentModule.contentStandard,
  });
}));

module.exports = router;
