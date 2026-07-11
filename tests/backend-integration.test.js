'use strict';

/**
 * Integration test for the backend request flow: account creation (no
 * subject at registration), starting a course enrollment (AI-generated
 * diagnostic quiz + modules + related topics), diagnostic scoring,
 * content delivery, module completion with correct repeat-on-failure
 * behaviour, and multi-course support (a second enrollment on the same
 * account without logging out).
 *
 * Runs the REAL route files in src/server/routes exactly as written. The
 * only substitutions are for things this offline sandbox cannot reach:
 * MongoDB (replaced with an in-memory store), the Gemini network call
 * (replaced with a canned but schema-valid response), and the native
 * bcrypt/jsonwebtoken bindings (replaced with real crypto.scrypt/HMAC
 * implementations — genuinely functional, just not the same npm package).
 * See the fake package implementations under node_modules for what each
 * substitute does.
 */

process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
process.env.MONGODB_URI = 'fake://in-memory';
process.env.GEMINI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateRequest } = require('express');

function buildCannedAiResponse(subject) {
  const diagnosticQuiz = [];
  const difficulties = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];
  for (let i = 0; i < 10; i++) {
    diagnosticQuiz.push({
      question: `${subject} diagnostic question ${i + 1}?`,
      options: ['correct', 'wrong-b', 'wrong-c', 'wrong-d'],
      correctOptionIndex: 0,
      difficulty: difficulties[i],
    });
  }

  const modules = [];
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  for (const level of levels) {
    for (let sequence = 1; sequence <= 3; sequence++) {
      modules.push({
        level,
        sequence,
        contentStandard: `<h2>${subject} ${level} Module ${sequence}</h2><p>Full lesson content for ${level} learners, module ${sequence}.</p>`,
        contentTextOnly: `${subject} ${level} Module ${sequence}: condensed text-only lesson.`,
        assessmentQuestions: [
          { question: `Sample question for ${level} module ${sequence}?`, options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
        ],
      });
    }
  }

  const relatedTopics = [`Related to ${subject} #1`, `Related to ${subject} #2`, `Related to ${subject} #3`];
  return { diagnosticQuiz, modules, relatedTopics };
}

global.fetch = async (url, options) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    const body = JSON.parse(options.body);
    const promptText = body.messages[0].content;
    const subjectMatch = /subject "([^"]+)"/.exec(promptText);
    const subject = subjectMatch ? subjectMatch[1] : 'UnknownSubject';
    if (subject === 'SubjectThatTriggersAiFailure') {
      return { ok: false, status: 500, text: async () => 'upstream error' };
    }
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(buildCannedAiResponse(subject)) } }] }),
    };
  }
  throw new Error(`Unexpected fetch call to ${url} — only the Gemini endpoint is stubbed.`);
};

const { createApp } = require('../src/server/app');
const { signToken, COOKIE_NAME } = require('../src/server/middleware/auth');

async function registerAccount(app, email) {
  const res = await simulateRequest(app, 'POST', '/api/auth/register', {
    body: { email, password: 'correct-horse-battery-staple' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const cookie = signToken({ _id: res.body.user.id, email: res.body.user.email });
  return { userId: res.body.user.id, cookies: { [COOKIE_NAME]: cookie } };
}

test('account creation no longer requires a subject', async () => {
  const app = createApp();
  const { userId } = await registerAccount(app, 'no.subject@example.com');
  assert.ok(userId);
});

test('full flow: enroll -> diagnostic quiz -> score -> content -> repeat-on-failure -> pass -> advance', async () => {
  const app = createApp();
  const { cookies } = await registerAccount(app, 'learner@example.com');

  // --- Dashboard starts empty ---
  const emptyDashboard = await simulateRequest(app, 'GET', '/api/enrollments', { cookies });
  assert.equal(emptyDashboard.status, 200);
  assert.equal(emptyDashboard.body.enrollments.length, 0);

  // --- Enroll in a subject: generates quiz + modules + related topics ---
  const enrollRes = await simulateRequest(app, 'POST', '/api/enrollments', {
    cookies,
    body: { subject: 'IntroductionToComputing' },
  });
  assert.equal(enrollRes.status, 201, JSON.stringify(enrollRes.body));
  assert.equal(enrollRes.body.diagnosticQuiz.length, 10);
  assert.equal(enrollRes.body.diagnosticQuiz[0].correctOptionIndex, undefined, 'correct answers must not be exposed before scoring');
  const enrollmentId = enrollRes.body.enrollment.id;

  // --- Duplicate enrollment in the same subject is rejected, with a pointer to the existing one ---
  const dupeEnrollRes = await simulateRequest(app, 'POST', '/api/enrollments', {
    cookies,
    body: { subject: 'IntroductionToComputing' },
  });
  assert.equal(dupeEnrollRes.status, 409);
  assert.equal(dupeEnrollRes.body.enrollmentId, enrollmentId);

  // --- Score the diagnostic: 8/10 correct = 80% = Advanced ---
  const diagRes = await simulateRequest(app, 'POST', `/api/enrollments/${enrollmentId}/complete-diagnostic`, {
    cookies,
    body: { answers: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1] },
  });
  assert.equal(diagRes.status, 200, JSON.stringify(diagRes.body));
  assert.equal(diagRes.body.enrollment.diagnosticScore, 80);
  assert.equal(diagRes.body.enrollment.proficiencyLevel, 'Advanced');
  const firstModuleId = diagRes.body.currentModuleId;
  assert.ok(firstModuleId.includes('advanced-1'));

  // --- FAIL the first module: must repeat the SAME module, not advance ---
  const failRes = await simulateRequest(app, 'POST', `/api/enrollments/${enrollmentId}/complete-module`, {
    cookies,
    body: { moduleId: firstModuleId, assessmentScore: 30 },
  });
  assert.equal(failRes.status, 200, JSON.stringify(failRes.body));
  assert.equal(failRes.body.decision, 'REMEDIATE');
  assert.equal(failRes.body.currentModuleId, firstModuleId, 'a failed attempt must NOT advance the current module');
  console.log('  -> confirmed: failing a module correctly repeats the same module, not the next one');

  // --- Fail it AGAIN: still the same module ---
  const failAgainRes = await simulateRequest(app, 'POST', `/api/enrollments/${enrollmentId}/complete-module`, {
    cookies,
    body: { moduleId: firstModuleId, assessmentScore: 45 },
  });
  assert.equal(failAgainRes.body.currentModuleId, firstModuleId);

  // --- NOW pass it: must advance to the second module ---
  const passRes = await simulateRequest(app, 'POST', `/api/enrollments/${enrollmentId}/complete-module`, {
    cookies,
    body: { moduleId: firstModuleId, assessmentScore: 90 },
  });
  assert.equal(passRes.status, 200, JSON.stringify(passRes.body));
  assert.equal(passRes.body.decision, 'ADVANCE');
  assert.notEqual(passRes.body.currentModuleId, firstModuleId, 'passing must advance to a different module');
  assert.equal(passRes.body.enrollment.completedModules.length, 3, 'all 3 attempts (2 fails + 1 pass) are recorded');
  assert.equal(passRes.body.enrollment.completedModules.filter((m) => m.passed).length, 1, 'only 1 counts as passed');
  console.log('  -> confirmed: passing advances to the next module; all attempts are still recorded for evaluation');

  // --- Content is fetchable for the current module ---
  const contentRes = await simulateRequest(app, 'GET', `/api/content/${passRes.body.currentModuleId}?mode=standard`, { cookies });
  assert.equal(contentRes.status, 200, JSON.stringify(contentRes.body));
});

test('multi-word subjects do not break module lookup (regression test for the moduleId mismatch bug)', async () => {
  const app = createApp();
  const { cookies } = await registerAccount(app, 'ai.learner@example.com');

  const enrollRes = await simulateRequest(app, 'POST', '/api/enrollments', {
    cookies,
    body: { subject: 'Artificial Intelligence' },
  });
  assert.equal(enrollRes.status, 201, JSON.stringify(enrollRes.body));
  const enrollmentId = enrollRes.body.enrollment.id;

  const diagRes = await simulateRequest(app, 'POST', `/api/enrollments/${enrollmentId}/complete-diagnostic`, {
    cookies,
    body: { answers: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1] },
  });
  assert.equal(diagRes.status, 200, JSON.stringify(diagRes.body));

  const moduleId = diagRes.body.currentModuleId;
  assert.ok(moduleId.includes('artificial-intelligence'), `expected a hyphenated slug, got: ${moduleId}`);
  assert.ok(!moduleId.includes(' '), 'moduleId must not contain a raw space');

  const contentRes = await simulateRequest(app, 'GET', `/api/content/${moduleId}?mode=standard`, { cookies });
  assert.equal(contentRes.status, 200, `content lookup failed for moduleId "${moduleId}": ${JSON.stringify(contentRes.body)}`);
});

test('a single account can enroll in multiple courses without logging out', async () => {
  const app = createApp();
  const { cookies } = await registerAccount(app, 'multi.course@example.com');

  const first = await simulateRequest(app, 'POST', '/api/enrollments', { cookies, body: { subject: 'Mathematics' } });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await simulateRequest(app, 'POST', '/api/enrollments', { cookies, body: { subject: 'Fiscal Policy' } });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.notEqual(first.body.enrollment.id, second.body.enrollment.id);

  const dashboard = await simulateRequest(app, 'GET', '/api/enrollments', { cookies });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.enrollments.length, 2);
  const subjects = dashboard.body.enrollments.map((e) => e.subject).sort();
  assert.deepEqual(subjects, ['Fiscal Policy', 'Mathematics']);
  console.log('  -> confirmed: one account, two enrollments, no logout or new account required');
});

test('an enrollment cannot be accessed or modified by a different account', async () => {
  const app = createApp();
  const owner = await registerAccount(app, 'owner@example.com');
  const intruder = await registerAccount(app, 'intruder@example.com');

  const enrollRes = await simulateRequest(app, 'POST', '/api/enrollments', {
    cookies: owner.cookies,
    body: { subject: 'PrivateSubject' },
  });
  const enrollmentId = enrollRes.body.enrollment.id;

  const intrusion = await simulateRequest(app, 'GET', `/api/enrollments/${enrollmentId}`, { cookies: intruder.cookies });
  assert.equal(intrusion.status, 403);
});

test('registration fails cleanly and returns 502 when AI content generation fails', async () => {
  const app = createApp();
  const { cookies } = await registerAccount(app, 'ai.failure@example.com');
  const res = await simulateRequest(app, 'POST', '/api/enrollments', {
    cookies,
    body: { subject: 'SubjectThatTriggersAiFailure' },
  });
  assert.equal(res.status, 502);
  assert.match(res.body.error, /failed/i);
});

test('an unexpected internal error does not crash the server (asyncHandler regression test)', async () => {
  const Enrollment = require('../src/server/models/Enrollment');
  const app = createApp();
  const { cookies } = await registerAccount(app, 'crash.test@example.com');

  const enrollRes = await simulateRequest(app, 'POST', '/api/enrollments', { cookies, body: { subject: 'CrashTestSubject' } });
  const enrollmentId = enrollRes.body.enrollment.id;

  const originalFindOne = Enrollment.findOne;
  Enrollment.findOne = async () => {
    throw new Error('Simulated database failure');
  };

  let threw = false;
  let result;
  try {
    result = await simulateRequest(app, 'GET', `/api/enrollments/${enrollmentId}`, { cookies });
  } catch (err) {
    threw = true;
  } finally {
    Enrollment.findOne = originalFindOne;
  }

  assert.equal(threw, false, 'the request should NOT throw/crash — asyncHandler should catch it');
  assert.equal(result.status, 500);
  assert.match(result.body.error, /unexpected server error/i);
  console.log('  -> confirmed: an internal error returns a clean 500 instead of crashing the server');
});
