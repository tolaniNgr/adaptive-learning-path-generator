/**
 * adaptive-engine.js
 *
 * Rule-based conditional logic engine for proficiency classification,
 * personalised path generation, and progression/remediation decisions.
 *
 * This is deliberately NOT a machine learning classifier: it contains no
 * trained parameters and derives no structure from data. It is a fixed,
 * hand-authored set of If-Then-Else rules applied to a diagnostic score.
 * It is designed to run entirely client-side, with no network dependency,
 * so that adaptive routing continues to function offline.
 */

'use strict';

const PROFICIENCY_THRESHOLDS = Object.freeze({
  BEGINNER_UPPER_BOUND: 40,      // score < 40        => Beginner
  INTERMEDIATE_UPPER_BOUND: 75,  // 40 <= score < 75  => Intermediate
  // score >= 75 => Advanced
});

const PASS_THRESHOLD = 60; // percentage required to pass a module and advance

/**
 * Classifies a learner's proficiency tier from a diagnostic assessment score.
 * Uses strict numeric boundaries (not integer cutoffs) so that fractional
 * scores such as 39.9 or 74.99 are classified correctly.
 * @param {number} diagnosticScore - a percentage score between 0 and 100.
 * @returns {'Beginner'|'Intermediate'|'Advanced'}
 */
function classifyProficiency(diagnosticScore) {
  if (typeof diagnosticScore !== 'number' || Number.isNaN(diagnosticScore)) {
    throw new TypeError(`diagnosticScore must be a number, got ${diagnosticScore}`);
  }
  if (diagnosticScore < 0 || diagnosticScore > 100) {
    throw new RangeError(`diagnosticScore must be between 0 and 100, got ${diagnosticScore}`);
  }
  if (diagnosticScore < PROFICIENCY_THRESHOLDS.BEGINNER_UPPER_BOUND) return 'Beginner';
  if (diagnosticScore < PROFICIENCY_THRESHOLDS.INTERMEDIATE_UPPER_BOUND) return 'Intermediate';
  return 'Advanced';
}

/**
 * Builds the three-tier module library for a subject (3 modules per tier,
 * matching the 9-module AI content generation spec in Section 3.7.6).
 */
function buildModuleLibrary(subject) {
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  const library = {};
  for (const level of levels) {
    library[level] = [1, 2, 3].map((n) => ({
      moduleId: `${subject}-${level}-${n}`.toLowerCase(),
      level,
      sequence: n,
    }));
  }
  return library;
}

/**
 * Generates an ordered learning path starting at the learner's classified
 * tier and progressing upward through the remaining tiers.
 */
function generatePath(proficiencyLevel, subject) {
  const order = ['Beginner', 'Intermediate', 'Advanced'];
  const startIndex = order.indexOf(proficiencyLevel);
  if (startIndex === -1) {
    throw new RangeError(`Unknown proficiencyLevel: ${proficiencyLevel}`);
  }
  const library = buildModuleLibrary(subject);
  return order.slice(startIndex).flatMap((level) => library[level].map((m) => m.moduleId));
}

/**
 * Initialises a new learner profile at registration, following the MCP-inspired
 * structure described in Section 3.7.5 (profile-manager.js).
 */
function initialiseLearnerProfile(userId, diagnosticScore, subject) {
  const proficiencyLevel = classifyProficiency(diagnosticScore);
  return {
    userId,
    proficiencyLevel,
    currentPath: generatePath(proficiencyLevel, subject),
    completedModules: [],
    diagnosticScore,
    lastAssessmentScore: null,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Evaluates a module completion against the 60% pass threshold and returns
 * the routing decision plus the updated profile.
 */
function evaluateModuleCompletion(profile, moduleId, assessmentScore) {
  if (typeof assessmentScore !== 'number' || assessmentScore < 0 || assessmentScore > 100) {
    throw new RangeError(`assessmentScore must be between 0 and 100, got ${assessmentScore}`);
  }
  const passed = assessmentScore >= PASS_THRESHOLD;
  const updatedProfile = {
    ...profile,
    completedModules: [
      ...profile.completedModules,
      { moduleId, score: assessmentScore, passed },
    ],
    lastAssessmentScore: assessmentScore,
    lastUpdated: new Date().toISOString(),
  };
  return {
    updatedProfile,
    decision: passed ? 'ADVANCE' : 'REMEDIATE',
  };
}

module.exports = {
  PROFICIENCY_THRESHOLDS,
  PASS_THRESHOLD,
  classifyProficiency,
  buildModuleLibrary,
  generatePath,
  initialiseLearnerProfile,
  evaluateModuleCompletion,
};
