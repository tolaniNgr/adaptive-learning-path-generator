'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyProficiency,
  generatePath,
  initialiseLearnerProfile,
  evaluateModuleCompletion,
  PASS_THRESHOLD,
} = require('../src/adaptive-engine');

// 20 classification test cases, including the four boundary values
// (39, 40, 74, 75) called out in Chapter Four, plus decimal edge cases.
const classificationCases = [
  { score: 0, expected: 'Beginner' },
  { score: 1, expected: 'Beginner' },
  { score: 15, expected: 'Beginner' },
  { score: 25, expected: 'Beginner' },
  { score: 39, expected: 'Beginner' },       // boundary
  { score: 39.9, expected: 'Beginner' },     // decimal edge case
  { score: 40, expected: 'Intermediate' },   // boundary
  { score: 40.5, expected: 'Intermediate' }, // decimal edge case
  { score: 45, expected: 'Intermediate' },
  { score: 50, expected: 'Intermediate' },
  { score: 55, expected: 'Intermediate' },
  { score: 60, expected: 'Intermediate' },
  { score: 65, expected: 'Intermediate' },
  { score: 70, expected: 'Intermediate' },
  { score: 74, expected: 'Intermediate' },   // boundary
  { score: 74.9, expected: 'Intermediate' }, // decimal edge case
  { score: 75, expected: 'Advanced' },       // boundary
  { score: 75.1, expected: 'Advanced' },     // decimal edge case
  { score: 90, expected: 'Advanced' },
  { score: 100, expected: 'Advanced' },
];

test(`proficiency classification — ${classificationCases.length} test cases`, () => {
  let correct = 0;
  for (const { score, expected } of classificationCases) {
    const actual = classifyProficiency(score);
    if (actual === expected) correct += 1;
    assert.equal(actual, expected, `score ${score}: expected ${expected}, got ${actual}`);
  }
  console.log(`  -> ${correct}/${classificationCases.length} classification cases correct`);
});

test('rejects out-of-range and non-numeric diagnostic scores', () => {
  assert.throws(() => classifyProficiency(-1), RangeError);
  assert.throws(() => classifyProficiency(101), RangeError);
  assert.throws(() => classifyProficiency('75'), TypeError);
  assert.throws(() => classifyProficiency(NaN), TypeError);
});

test('path generation: Beginner receives all 9 modules across 3 tiers', () => {
  const path = generatePath('Beginner', 'ComputingIntro');
  assert.equal(path.length, 9);
  assert.equal(path[0], 'computingintro-beginner-1');
  assert.equal(path.at(-1), 'computingintro-advanced-3');
});

test('path generation: Intermediate receives 6 modules (Intermediate + Advanced only)', () => {
  const path = generatePath('Intermediate', 'ComputingIntro');
  assert.equal(path.length, 6);
  assert.ok(path.every((id) => !id.includes('beginner')));
});

test('path generation: Advanced receives 3 modules (Advanced only)', () => {
  const path = generatePath('Advanced', 'ComputingIntro');
  assert.equal(path.length, 3);
  assert.ok(path.every((id) => id.includes('advanced')));
});

test('initialiseLearnerProfile produces a correctly classified, path-assigned profile', () => {
  const profile = initialiseLearnerProfile('user-001', 82, 'ComputingIntro');
  assert.equal(profile.proficiencyLevel, 'Advanced');
  assert.equal(profile.currentPath.length, 3);
  assert.deepEqual(profile.completedModules, []);
  assert.equal(profile.diagnosticScore, 82);
});

// Module completion / pass-remediate boundary at the 60% threshold
const completionCases = [
  { score: 0, expected: 'REMEDIATE' },
  { score: 30, expected: 'REMEDIATE' },
  { score: 59, expected: 'REMEDIATE' },       // boundary
  { score: 59.9, expected: 'REMEDIATE' },     // decimal edge case
  { score: 60, expected: 'ADVANCE' },         // boundary
  { score: 60.1, expected: 'ADVANCE' },       // decimal edge case
  { score: 75, expected: 'ADVANCE' },
  { score: 100, expected: 'ADVANCE' },
];

test(`module completion routing — ${completionCases.length} test cases at PASS_THRESHOLD=${PASS_THRESHOLD}`, () => {
  let correct = 0;
  const profile = initialiseLearnerProfile('user-002', 50, 'ComputingIntro');
  for (const { score, expected } of completionCases) {
    const { decision } = evaluateModuleCompletion(profile, 'computingintro-intermediate-1', score);
    if (decision === expected) correct += 1;
    assert.equal(decision, expected, `score ${score}: expected ${expected}, got ${decision}`);
  }
  console.log(`  -> ${correct}/${completionCases.length} routing decisions correct`);
});

test('evaluateModuleCompletion correctly appends to completedModules without mutating the original profile', () => {
  const profile = initialiseLearnerProfile('user-003', 45, 'ComputingIntro');
  const { updatedProfile } = evaluateModuleCompletion(profile, 'computingintro-intermediate-1', 72);
  assert.equal(profile.completedModules.length, 0, 'original profile must not be mutated');
  assert.equal(updatedProfile.completedModules.length, 1);
  assert.equal(updatedProfile.completedModules[0].passed, true);
  assert.equal(updatedProfile.lastAssessmentScore, 72);
});
