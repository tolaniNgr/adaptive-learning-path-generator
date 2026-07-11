/**
 * adaptive-engine.js
 *
 * Rule-based conditional logic engine for proficiency classification,
 * personalised path generation, and section-based progression.
 *
 * This is deliberately NOT a machine learning classifier: it contains no
 * trained parameters and derives no structure from data. It is a fixed,
 * hand-authored set of If-Then-Else rules applied to a diagnostic score.
 * It is designed to run entirely client-side, with no network dependency,
 * so that adaptive routing continues to function offline.
 *
 * Assessment granularity: gating happens at the SECTION level (one
 * proficiency tier's 3 modules), not per module. A learner reads all 3
 * modules of a section, then takes ONE assessment (5+ questions) covering
 * the whole section, testing recall rather than immediate lookup. Passing
 * unlocks the next section; failing repeats the section. All 3 modules of
 * an unlocked section are freely navigable (back and forward, and
 * revisitable after the section is passed) since there is no per-module
 * gate to enforce sequentially within a section.
 */

'use strict';

const PROFICIENCY_THRESHOLDS = Object.freeze({
  BEGINNER_UPPER_BOUND: 40,      // score < 40        => Beginner
  INTERMEDIATE_UPPER_BOUND: 75,  // 40 <= score < 75  => Intermediate
  // score >= 75 => Advanced
});

const PASS_THRESHOLD = 60; // percentage required to pass a section and advance
const MODULES_PER_SECTION = 3;
const LEVEL_ORDER = Object.freeze(['Beginner', 'Intermediate', 'Advanced']);
const MIN_SECTION_ASSESSMENT_QUESTIONS = 5;

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
 * Builds a stable, URL-safe module identifier from a subject, level, and
 * sequence number. This is the SINGLE canonical implementation, used by
 * both the client-side path generator below and the server-side AI
 * content generator, which requires this same module rather than
 * duplicating the logic — a previously duplicated version handled subject
 * names with spaces differently in each place, causing a real "module not
 * found" bug for any multi-word subject.
 * @param {string} subject
 * @param {string} level
 * @param {number} sequence
 * @returns {string}
 */
function buildModuleId(subject, level, sequence) {
  const slug = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slug(subject)}-${slug(level)}-${sequence}`;
}

/**
 * Builds the three-tier module library for a subject (3 modules per tier).
 */
function buildModuleLibrary(subject) {
  const library = {};
  for (const level of LEVEL_ORDER) {
    library[level] = [1, 2, 3].map((n) => ({
      moduleId: buildModuleId(subject, level, n),
      level,
      sequence: n,
    }));
  }
  return library;
}

/**
 * Generates an ordered learning path starting at the learner's classified
 * tier and progressing upward through the remaining tiers. Always a
 * multiple of MODULES_PER_SECTION long.
 */
function generatePath(proficiencyLevel, subject) {
  const startIndex = LEVEL_ORDER.indexOf(proficiencyLevel);
  if (startIndex === -1) {
    throw new RangeError(`Unknown proficiencyLevel: ${proficiencyLevel}`);
  }
  const library = buildModuleLibrary(subject);
  return LEVEL_ORDER.slice(startIndex).flatMap((level) => library[level].map((m) => m.moduleId));
}

/**
 * The ordered list of section levels in a learner's path, e.g. a learner
 * starting at Intermediate has sections ['Intermediate', 'Advanced'].
 */
function getSectionLevels(startingProficiencyLevel) {
  const startIndex = LEVEL_ORDER.indexOf(startingProficiencyLevel);
  if (startIndex === -1) {
    throw new RangeError(`Unknown proficiencyLevel: ${startingProficiencyLevel}`);
  }
  return LEVEL_ORDER.slice(startIndex);
}

function getTotalSections(startingProficiencyLevel) {
  return getSectionLevels(startingProficiencyLevel).length;
}

/**
 * The level (Beginner/Intermediate/Advanced) that a given section index
 * (0-based) corresponds to, for a learner's specific starting level.
 */
function getSectionLevelForIndex(startingProficiencyLevel, sectionIndex) {
  return getSectionLevels(startingProficiencyLevel)[sectionIndex];
}

/**
 * Initialises a new enrollment at diagnostic completion.
 * unlockedSectionsCount starts at 1: the learner's first section (3
 * modules) is immediately readable, with no per-module gate within it.
 */
function initialiseLearnerProfile(userId, diagnosticScore, subject) {
  const proficiencyLevel = classifyProficiency(diagnosticScore);
  return {
    userId,
    proficiencyLevel,
    currentPath: generatePath(proficiencyLevel, subject),
    unlockedSectionsCount: 1,
    sectionAttempts: [],
    diagnosticScore,
    lastAssessmentScore: null,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * The module IDs currently accessible for reading or review: everything
 * in every unlocked section, from the start of the path. This list only
 * grows (sections stay unlocked permanently once reached), which is what
 * makes "go back and relearn any earlier module" work — there is no
 * separate "completed vs accessible" distinction to track.
 */
function getAccessibleModules(profile) {
  return profile.currentPath.slice(0, profile.unlockedSectionsCount * MODULES_PER_SECTION);
}

/**
 * Whether the section at sectionIndex has already been passed.
 */
function isSectionPassed(profile, sectionIndex) {
  const level = getSectionLevelForIndex(profile.proficiencyLevel, sectionIndex);
  return profile.sectionAttempts.some((a) => a.level === level && a.passed);
}

/**
 * Whether the entire path has been completed (every section passed).
 */
function isPathComplete(profile) {
  const totalSections = getTotalSections(profile.proficiencyLevel);
  for (let i = 0; i < totalSections; i++) {
    if (!isSectionPassed(profile, i)) return false;
  }
  return true;
}

/**
 * Scores a set of multiple-choice answers against their answer key.
 * Shared by diagnostic quiz scoring and section assessment scoring so the
 * two do not risk diverging the way buildModuleId once did.
 * @param {Array<{correctOptionIndex: number}>} questions
 * @param {number[]} answers - submitted option indices, same order as questions
 * @returns {number} percentage score, 0-100
 */
function scoreMultipleChoice(questions, answers) {
  let correct = 0;
  questions.forEach((q, i) => {
    if (answers[i] === q.correctOptionIndex) correct += 1;
  });
  return questions.length ? Math.round((correct / questions.length) * 100) : 0;
}

/**
 * Evaluates a section assessment attempt and returns the updated profile
 * fields plus the routing decision. On failure, unlockedSectionsCount does
 * NOT change — the learner can review the section's modules again and
 * retry the assessment. On success, the next section (if any) unlocks.
 * @param {{proficiencyLevel: string, unlockedSectionsCount: number, sectionAttempts: Array}} profile
 * @param {string} level - the section level being assessed, e.g. "Beginner"
 * @param {number} score - percentage score already computed via scoreMultipleChoice
 */
function evaluateSectionAssessment(profile, level, score) {
  if (typeof score !== 'number' || score < 0 || score > 100) {
    throw new RangeError(`score must be between 0 and 100, got ${score}`);
  }
  const sectionLevels = getSectionLevels(profile.proficiencyLevel);
  const sectionIndex = sectionLevels.indexOf(level);
  if (sectionIndex === -1) {
    throw new RangeError(`"${level}" is not a section in this learner's path (${sectionLevels.join(', ')}).`);
  }
  const expectedSectionIndex = profile.unlockedSectionsCount - 1;
  if (sectionIndex !== expectedSectionIndex) {
    throw new RangeError(
      `Section "${level}" is not the current section awaiting assessment (expected "${sectionLevels[expectedSectionIndex]}").`
    );
  }

  const passed = score >= PASS_THRESHOLD;
  const sectionAttempts = [...profile.sectionAttempts, { level, score, passed, attemptedAt: new Date().toISOString() }];
  const totalSections = getTotalSections(profile.proficiencyLevel);
  const unlockedSectionsCount = passed
    ? Math.min(profile.unlockedSectionsCount + 1, totalSections)
    : profile.unlockedSectionsCount;

  return {
    decision: passed ? 'ADVANCE' : 'REMEDIATE',
    updatedProfile: { ...profile, sectionAttempts, unlockedSectionsCount, lastAssessmentScore: score },
  };
}

module.exports = {
  PROFICIENCY_THRESHOLDS,
  PASS_THRESHOLD,
  MODULES_PER_SECTION,
  LEVEL_ORDER,
  MIN_SECTION_ASSESSMENT_QUESTIONS,
  classifyProficiency,
  buildModuleId,
  buildModuleLibrary,
  generatePath,
  getSectionLevels,
  getTotalSections,
  getSectionLevelForIndex,
  initialiseLearnerProfile,
  getAccessibleModules,
  isSectionPassed,
  isPathComplete,
  scoreMultipleChoice,
  evaluateSectionAssessment,
};
