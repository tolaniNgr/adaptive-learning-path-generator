'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const ContentModule = require('../models/ContentModule');
const SectionAssessment = require('../models/SectionAssessment');
const { generateRegistrationContent } = require('../services/aiContentGenerator');
const {
  initialiseLearnerProfile,
  evaluateSectionAssessment,
  scoreMultipleChoice,
  getAccessibleModules,
  getSectionLevels,
  isPathComplete,
} = require('../../adaptive-engine');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

function summarize(enrollment) {
  return {
    id: enrollment._id,
    subject: enrollment.subject,
    diagnosticCompleted: enrollment.diagnosticCompleted,
    proficiencyLevel: enrollment.proficiencyLevel,
    unlockedSectionsCount: enrollment.unlockedSectionsCount,
    totalSections: enrollment.proficiencyLevel ? getSectionLevels(enrollment.proficiencyLevel).length : 0,
    pathComplete: enrollment.diagnosticCompleted && isPathComplete(enrollment),
  };
}

/**
 * Full enrollment detail, including fields only summarize() omits
 * (currentPath, sectionAttempts, relatedTopics) plus the same computed
 * convenience fields summarize() adds (totalSections, pathComplete) —
 * used consistently for every response that returns a full enrollment,
 * so the client never has to guess which shape a given response has.
 */
function detail(enrollment) {
  return {
    id: enrollment._id,
    userId: enrollment.userId,
    subject: enrollment.subject,
    diagnosticCompleted: enrollment.diagnosticCompleted,
    diagnosticScore: enrollment.diagnosticScore,
    proficiencyLevel: enrollment.proficiencyLevel,
    currentPath: enrollment.currentPath,
    unlockedSectionsCount: enrollment.unlockedSectionsCount,
    sectionAttempts: enrollment.sectionAttempts,
    lastAssessmentScore: enrollment.lastAssessmentScore,
    relatedTopics: enrollment.relatedTopics,
    totalSections: enrollment.proficiencyLevel ? getSectionLevels(enrollment.proficiencyLevel).length : 0,
    pathComplete: enrollment.diagnosticCompleted && isPathComplete(enrollment),
  };
}

/**
 * The level (and index) of the section currently awaiting its assessment:
 * the most recently unlocked section, unless it has already been passed
 * (i.e. the whole path is complete).
 */
function currentPendingSection(enrollment) {
  const levels = getSectionLevels(enrollment.proficiencyLevel);
  const sectionIndex = enrollment.unlockedSectionsCount - 1;
  if (sectionIndex < 0 || sectionIndex >= levels.length) return null;
  const level = levels[sectionIndex];
  const alreadyPassed = enrollment.sectionAttempts.some((a) => a.level === level && a.passed);
  return alreadyPassed ? null : level;
}

async function loadOwnedEnrollment(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.enrollmentId)) {
    res.status(404).json({ error: 'Enrollment not found.' });
    return null;
  }
  const enrollment = await Enrollment.findOne({ _id: req.params.enrollmentId });
  if (!enrollment) {
    res.status(404).json({ error: 'Enrollment not found.' });
    return null;
  }
  if (enrollment.userId.toString() !== req.userId) {
    res.status(403).json({ error: 'This enrollment does not belong to your account.' });
    return null;
  }
  return enrollment;
}

/**
 * GET /api/enrollments
 * Lists every course the current account has ever enrolled in — the data
 * behind the "My Courses" dashboard.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollments = await Enrollment.find({ userId: req.userId });
    res.json({ enrollments: enrollments.map(summarize) });
  })
);

/**
 * POST /api/enrollments
 * Body: { subject }
 *
 * Enrolls the current account in a new subject: generates the diagnostic
 * quiz, 9 content modules, 3 section assessments, and related topics via
 * ONE Gemini call (Section 3.7.6).
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { subject } = req.body;
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'subject is required.' });
    }
    const trimmedSubject = subject.trim();

    const existing = await Enrollment.findOne({ userId: req.userId, subject: trimmedSubject });
    if (existing) {
      return res.status(409).json({
        error: `You are already enrolled in "${trimmedSubject}".`,
        enrollmentId: existing._id,
      });
    }

    let generated;
    try {
      generated = await generateRegistrationContent(trimmedSubject);
    } catch (err) {
      console.error('AI content generation failed:', err.message);
      return res.status(502).json({
        error: 'Content generation failed. Please try enrolling again in a moment.',
        detail: err.message,
      });
    }

    await ContentModule.insertMany(generated.modules, { ordered: false }).catch((err) => {
      if (err.code !== 11000) throw err; // ignore duplicates if this subject was already generated for another learner
    });
    await SectionAssessment.insertMany(generated.sectionAssessments, { ordered: false }).catch((err) => {
      if (err.code !== 11000) throw err;
    });

    const enrollment = await Enrollment.create({
      userId: req.userId,
      subject: trimmedSubject,
      diagnosticQuiz: generated.diagnosticQuiz,
      relatedTopics: generated.relatedTopics,
      diagnosticCompleted: false,
    });

    res.status(201).json({
      enrollment: summarize(enrollment),
      diagnosticQuiz: generated.diagnosticQuiz.map((q) => ({ question: q.question, options: q.options, difficulty: q.difficulty })),
    });
  })
);

/**
 * GET /api/enrollments/:enrollmentId
 * Full detail for one enrollment: if the diagnostic isn't done yet,
 * returns the quiz; otherwise returns the enrollment, the list of
 * currently accessible module IDs (everything unlocked, for free
 * back/forward navigation and review of earlier sections), and — if a
 * section assessment is currently due — its level (questions are fetched
 * separately, without answers, via the section-assessment route).
 */
router.get(
  '/:enrollmentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollment = await loadOwnedEnrollment(req, res);
    if (!enrollment) return;
    if (!enrollment.diagnosticCompleted) {
      return res.json({
        enrollment: summarize(enrollment),
        diagnosticQuiz: enrollment.diagnosticQuiz.map((q) => ({ question: q.question, options: q.options, difficulty: q.difficulty })),
      });
    }
    res.json({
      enrollment: detail(enrollment),
      accessibleModules: getAccessibleModules(enrollment),
      pendingSectionAssessment: currentPendingSection(enrollment),
    });
  })
);

/**
 * POST /api/enrollments/:enrollmentId/complete-diagnostic
 * Body: { answers: number[] }
 */
router.post(
  '/:enrollmentId/complete-diagnostic',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollment = await loadOwnedEnrollment(req, res);
    if (!enrollment) return;
    if (enrollment.diagnosticCompleted) {
      return res.status(409).json({ error: 'The diagnostic quiz has already been completed for this enrollment.' });
    }

    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length !== enrollment.diagnosticQuiz.length) {
      return res.status(400).json({ error: `Expected ${enrollment.diagnosticQuiz.length} answers.` });
    }

    const diagnosticScore = scoreMultipleChoice(enrollment.diagnosticQuiz, answers);
    const engineProfile = initialiseLearnerProfile(req.userId, diagnosticScore, enrollment.subject);

    enrollment.diagnosticScore = diagnosticScore;
    enrollment.proficiencyLevel = engineProfile.proficiencyLevel;
    enrollment.currentPath = engineProfile.currentPath;
    enrollment.unlockedSectionsCount = engineProfile.unlockedSectionsCount;
    enrollment.diagnosticCompleted = true;
    await enrollment.save();

    res.json({
      enrollment: detail(enrollment),
      accessibleModules: getAccessibleModules(enrollment),
      pendingSectionAssessment: currentPendingSection(enrollment),
    });
  })
);

/**
 * GET /api/enrollments/:enrollmentId/section-assessment
 * Returns the questions (without correct answers) for the section
 * currently due for assessment. 404 if no section is currently due
 * (e.g. the whole path is already complete).
 */
router.get(
  '/:enrollmentId/section-assessment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollment = await loadOwnedEnrollment(req, res);
    if (!enrollment) return;
    const level = currentPendingSection(enrollment);
    if (!level) {
      return res.status(404).json({ error: 'No section assessment is currently due for this enrollment.' });
    }
    const assessment = await SectionAssessment.findOne({ subject: enrollment.subject, level });
    if (!assessment) {
      return res.status(404).json({ error: `Section assessment content for "${level}" was not found.` });
    }
    res.json({
      level,
      questions: assessment.questions.map((q) => ({ question: q.question, options: q.options })),
    });
  })
);

/**
 * POST /api/enrollments/:enrollmentId/section-assessment
 * Body: { level, answers: number[] }
 *
 * Scores the section assessment server-side (correct answers are never
 * sent to the client beforehand) and applies the pass/fail routing:
 * failing leaves the section unlocked for review and retry; passing
 * unlocks the next section, permanently (earlier sections are never
 * re-locked, so completed content stays available to revisit).
 */
router.post(
  '/:enrollmentId/section-assessment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollment = await loadOwnedEnrollment(req, res);
    if (!enrollment) return;

    const { level, answers } = req.body;
    const pendingLevel = currentPendingSection(enrollment);
    if (!pendingLevel) {
      return res.status(409).json({ error: 'No section assessment is currently due for this enrollment.' });
    }
    if (level !== pendingLevel) {
      return res.status(400).json({ error: `Expected an assessment submission for "${pendingLevel}", got "${level}".` });
    }

    const assessment = await SectionAssessment.findOne({ subject: enrollment.subject, level });
    if (!assessment) {
      return res.status(404).json({ error: `Section assessment content for "${level}" was not found.` });
    }
    if (!Array.isArray(answers) || answers.length !== assessment.questions.length) {
      return res.status(400).json({ error: `Expected ${assessment.questions.length} answers.` });
    }

    const score = scoreMultipleChoice(assessment.questions, answers);
    let evaluation;
    try {
      evaluation = evaluateSectionAssessment(enrollment, level, score);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    enrollment.sectionAttempts = evaluation.updatedProfile.sectionAttempts;
    enrollment.unlockedSectionsCount = evaluation.updatedProfile.unlockedSectionsCount;
    enrollment.lastAssessmentScore = score;
    await enrollment.save();

    res.json({
      decision: evaluation.decision,
      score,
      enrollment: detail(enrollment),
      accessibleModules: getAccessibleModules(enrollment),
      pendingSectionAssessment: currentPendingSection(enrollment),
    });
  })
);

module.exports = router;
