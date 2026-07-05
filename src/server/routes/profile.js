'use strict';

const express = require('express');
const LearnerProfile = require('../models/LearnerProfile');
const { requireAuth } = require('../middleware/auth');
const { evaluateModuleCompletion } = require('../../adaptive-engine');

const router = express.Router();

/**
 * GET /api/profile
 * Returns the server-persisted learner profile (the durable, cross-device
 * copy). The client also holds a mirror of this in localStorage for
 * offline-first adaptive routing.
 */
router.get('/', requireAuth, async (req, res) => {
  const profile = await LearnerProfile.findOne({ userId: req.userId });
  if (!profile) {
    return res.status(404).json({ error: 'No profile found for this learner.' });
  }
  res.json(profile);
});

/**
 * POST /api/profile/complete-module
 * Body: { moduleId, assessmentScore }
 *
 * The client's own copy of adaptive-engine.js already computes this
 * decision instantly, offline, for immediate UI feedback. This endpoint
 * recomputes the SAME decision server-side, using the identical shared
 * module (src/adaptive-engine.js, required by both the browser bundle and
 * this route), rather than trusting a client-submitted decision outright —
 * the client could otherwise report an inflated score. The score itself
 * is still client-supplied in this prototype (assessments are not
 * server-graded), but the pass/fail threshold logic is applied
 * identically and authoritatively here for the persisted record.
 */
router.post('/complete-module', requireAuth, async (req, res) => {
  const { moduleId, assessmentScore } = req.body;
  if (!moduleId || typeof assessmentScore !== 'number') {
    return res.status(400).json({ error: 'moduleId and assessmentScore are required.' });
  }

  const profile = await LearnerProfile.findOne({ userId: req.userId });
  if (!profile) {
    return res.status(404).json({ error: 'No profile found for this learner.' });
  }

  let evaluation;
  try {
    evaluation = evaluateModuleCompletion(
      { completedModules: profile.completedModules },
      moduleId,
      assessmentScore
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  profile.completedModules = evaluation.updatedProfile.completedModules;
  profile.lastAssessmentScore = assessmentScore;
  await profile.save();

  res.json({ decision: evaluation.decision, profile });
});

/**
 * POST /api/profile/sync
 * Body: { completedModules, lastAssessmentScore }
 *
 * Reconciles the client's offline-accumulated localStorage state with the
 * server copy once connectivity resumes, per the "local-first strategy"
 * described in Section 3.4.2. This is a last-write-wins merge, appropriate
 * for a single-user profile with no concurrent-writer conflicts.
 */
router.post('/sync', requireAuth, async (req, res) => {
  const { completedModules, lastAssessmentScore } = req.body;

  const profile = await LearnerProfile.findOneAndUpdate(
    { userId: req.userId },
    { $set: { completedModules, lastAssessmentScore } },
    { new: true }
  );

  if (!profile) {
    return res.status(404).json({ error: 'No profile found for this learner.' });
  }
  res.json(profile);
});

module.exports = router;
