'use strict';

const express = require('express');
const ContentModule = require('../models/ContentModule');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/content/:moduleId?mode=standard|text-only
 *
 * Serves the field matching the client's bandwidth-detected mode
 * (src/bandwidth-monitor.js, Section 3.7.4). The mode query parameter is
 * set by the client after its own probe measurement; the server does not
 * re-measure bandwidth, since only the client has visibility into the
 * learner's actual last-mile connection.
 */
router.get('/:moduleId', requireAuth, async (req, res) => {
  const { moduleId } = req.params;
  const mode = req.query.mode === 'text-only' ? 'text-only' : 'standard';

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
    assessmentQuestions: contentModule.assessmentQuestions,
  });
});

module.exports = router;
