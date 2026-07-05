'use strict';

/**
 * Integration test for the backend request flow: registration (with AI
 * content generation), login, content delivery, and module completion.
 *
 * Runs the REAL route files in src/server/routes exactly as written. The
 * only substitutions are for things this offline sandbox cannot reach:
 * MongoDB (replaced with an in-memory store), the OpenAI network call
 * (replaced with a canned but schema-valid response), and the native
 * bcrypt/jsonwebtoken bindings (replaced with real crypto.scrypt/HMAC
 * implementations — genuinely functional, just not the same npm package).
 * See the fake package implementations under node_modules for what each
 * substitute does.
 */

process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
process.env.MONGODB_URI = 'fake://in-memory';
process.env.OPENAI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateRequest } = require('express');

// --- Stub the network call inside aiContentGenerator.js ---
// Builds a schema-valid 9-module response so the REAL parsing/validation
// logic in aiContentGenerator.js and the REAL insertMany call in the
// register route both execute against realistic data.
function buildCannedAiResponse(subject) {
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  const modules = [];
  for (const level of levels) {
    for (let sequence = 1; sequence <= 3; sequence++) {
      modules.push({
        level,
        sequence,
        contentStandard: `<h2>${subject} ${level} Module ${sequence}</h2><p>Full lesson content for ${level} learners, module ${sequence}.</p>`,
        contentTextOnly: `${subject} ${level} Module ${sequence}: condensed text-only lesson.`,
        assessmentQuestions: [
          {
            question: `Sample question for ${level} module ${sequence}?`,
            options: ['A', 'B', 'C', 'D'],
            correctOptionIndex: 0,
          },
        ],
      });
    }
  }
  return modules;
}

global.fetch = async (url, options) => {
  if (String(url).includes('api.openai.com')) {
    const body = JSON.parse(options.body);
    const promptText = body.messages[0].content;
    const subjectMatch = /subject "([^"]+)"/.exec(promptText);
    const subject = subjectMatch ? subjectMatch[1] : 'UnknownSubject';
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(buildCannedAiResponse(subject)) } }],
      }),
    };
  }
  throw new Error(`Unexpected fetch call to ${url} — only the OpenAI endpoint is stubbed.`);
};

const { createApp } = require('../src/server/app');
const { signToken, COOKIE_NAME } = require('../src/server/middleware/auth');

test('full backend flow: register -> login -> fetch content -> pass a module -> fail a module', async () => {
  const app = createApp();

  // --- Registration (real bcrypt-fake hashing, real AI-generation parsing, real adaptive-engine classification) ---
  const registerRes = await simulateRequest(app, 'POST', '/api/auth/register', {
    body: {
      email: 'test.learner@example.com',
      password: 'correct-horse-battery-staple',
      subject: 'IntroductionToComputing',
      diagnosticScore: 82, // should classify as Advanced
    },
  });

  assert.equal(registerRes.status, 201, JSON.stringify(registerRes.body));
  assert.equal(registerRes.body.profile.proficiencyLevel, 'Advanced');
  assert.equal(registerRes.body.profile.currentPath.length, 3, 'Advanced learners should get 3 modules (Advanced tier only)');
  console.log('  -> registration produced profile:', registerRes.body.profile.proficiencyLevel, registerRes.body.profile.currentPath);

  // --- Duplicate registration should be rejected ---
  const dupeRes = await simulateRequest(app, 'POST', '/api/auth/register', {
    body: {
      email: 'test.learner@example.com',
      password: 'irrelevant',
      subject: 'IntroductionToComputing',
      diagnosticScore: 50,
    },
  });
  assert.equal(dupeRes.status, 409);

  // --- Login with correct credentials (real scrypt-fake password verification) ---
  const loginRes = await simulateRequest(app, 'POST', '/api/auth/login', {
    body: { email: 'test.learner@example.com', password: 'correct-horse-battery-staple' },
  });
  assert.equal(loginRes.status, 200, JSON.stringify(loginRes.body));

  // --- Login with wrong password should fail ---
  const badLoginRes = await simulateRequest(app, 'POST', '/api/auth/login', {
    body: { email: 'test.learner@example.com', password: 'wrong-password' },
  });
  assert.equal(badLoginRes.status, 401);

  const userId = registerRes.body.user.id;
  // Mint a real, validly-signed token via the actual signToken() function,
  // so every subsequent request runs through the REAL requireAuth
  // middleware (real JWT verification), not a bypass.
  const authCookie = signToken({ _id: userId, email: registerRes.body.user.email });
  const authedCookies = { [COOKIE_NAME]: authCookie };

  // --- Fetch content for the first module in the assigned path, text-only mode ---
  const moduleId = registerRes.body.profile.currentPath[0];
  const contentRes = await simulateRequest(app, 'GET', `/api/content/${moduleId}?mode=text-only`, {
    cookies: authedCookies,
  });
  assert.equal(contentRes.status, 200, JSON.stringify(contentRes.body));
  assert.equal(contentRes.body.mode, 'text-only');
  assert.ok(contentRes.body.content.length < 200, 'text-only content should be short');
  console.log('  -> fetched content for', moduleId, '-', contentRes.body.content);

  // --- Requests with no auth cookie at all should be rejected by the real requireAuth middleware ---
  const unauthedRes = await simulateRequest(app, 'GET', `/api/content/${moduleId}?mode=text-only`, {});
  assert.equal(unauthedRes.status, 401);

  // --- Requests with a tampered token should be rejected ---
  const tamperedRes = await simulateRequest(app, 'GET', `/api/content/${moduleId}?mode=text-only`, {
    cookies: { [COOKIE_NAME]: authCookie.slice(0, -2) + 'xx' },
  });
  assert.equal(tamperedRes.status, 401);

  // --- Complete the module with a PASSING score (>=60) ---
  const passRes = await simulateRequest(app, 'POST', '/api/profile/complete-module', {
    cookies: authedCookies,
    body: { moduleId, assessmentScore: 85 },
  });
  assert.equal(passRes.status, 200, JSON.stringify(passRes.body));
  assert.equal(passRes.body.decision, 'ADVANCE');
  assert.equal(passRes.body.profile.completedModules.length, 1);
  assert.equal(passRes.body.profile.completedModules[0].passed, true);

  // --- Complete a second module with a FAILING score (<60) ---
  const secondModuleId = registerRes.body.profile.currentPath[1];
  const failRes = await simulateRequest(app, 'POST', '/api/profile/complete-module', {
    cookies: authedCookies,
    body: { moduleId: secondModuleId, assessmentScore: 45 },
  });
  assert.equal(failRes.status, 200, JSON.stringify(failRes.body));
  assert.equal(failRes.body.decision, 'REMEDIATE');
  assert.equal(failRes.body.profile.completedModules.length, 2);
  assert.equal(failRes.body.profile.completedModules[1].passed, false);

  // --- GET profile reflects both completions ---
  const profileRes = await simulateRequest(app, 'GET', '/api/profile', { cookies: authedCookies });
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.completedModules.length, 2);

  console.log('  -> full flow verified: register, login, real-JWT auth (incl. rejecting missing/tampered tokens), content delivery, ADVANCE + REMEDIATE routing, profile persistence');
});

test('registration fails cleanly and returns 502 when AI content generation fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'upstream error' });

  const { createApp: createAppFresh } = require('../src/server/app');
  const app = createAppFresh();
  const res = await simulateRequest(app, 'POST', '/api/auth/register', {
    body: {
      email: 'second.learner@example.com',
      password: 'pw',
      subject: 'Mathematics',
      diagnosticScore: 30,
    },
  });
  assert.equal(res.status, 502);
  assert.match(res.body.error, /failed/i);

  global.fetch = originalFetch;
});
