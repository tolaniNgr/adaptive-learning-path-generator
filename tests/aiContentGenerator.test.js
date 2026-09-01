'use strict';

process.env.GEMINI_API_KEY = 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const { repairInvalidJsonEscapes, MAX_ATTEMPTS } = require('../src/server/services/aiContentGenerator');

test('repairInvalidJsonEscapes fixes a stray backslash that breaks JSON.parse', () => {
  // A raw backslash before a character that is not a valid JSON escape
  // (here, a literal "\(" inside a string) is exactly the class of error
  // Gemini produced in practice: "Bad escaped character in JSON".
  const broken = '{"content": "The function f\\(x) returns x squared."}';

  assert.throws(() => JSON.parse(broken), /bad escaped character/i, 'the broken input should indeed fail normal JSON.parse first');

  const repaired = repairInvalidJsonEscapes(broken);
  const parsed = JSON.parse(repaired);
  assert.equal(parsed.content, 'The function f\\(x) returns x squared.');
  console.log('  -> confirmed: a real "bad escaped character" JSON error is repaired and parses correctly');
});

test('repairInvalidJsonEscapes leaves valid escapes untouched', () => {
  const valid = '{"a": "line one\\nline two", "b": "a \\"quoted\\" word", "c": "path\\\\to\\\\file"}';
  const parsed = JSON.parse(repairInvalidJsonEscapes(valid));
  assert.equal(parsed.a, 'line one\nline two');
  assert.equal(parsed.b, 'a "quoted" word');
  assert.equal(parsed.c, 'path\\to\\file');
});

test('generateRegistrationContent retries on malformed JSON and succeeds once a good response arrives', async () => {
  const { generateRegistrationContent } = require('../src/server/services/aiContentGenerator');

  function validPayload(subject) {
    const diagnosticQuiz = Array.from({ length: 10 }, (_, i) => ({
      question: `${subject} q${i}`,
      options: ['a', 'b', 'c', 'd'],
      correctOptionIndex: 0,
      difficulty: 'easy',
    }));
    const modules = [];
    for (const level of ['Beginner', 'Intermediate', 'Advanced']) {
      for (let seq = 1; seq <= 3; seq++) {
        modules.push({
          level,
          sequence: seq,
          contentStandard: 'x',
          contentTextOnly: 'y',
        });
      }
    }
    // Assessment lives at the SECTION level now (one per proficiency
    // tier, covering all 3 of that tier's modules), not per module.
    const sectionAssessments = ['Beginner', 'Intermediate', 'Advanced'].map((level) => ({
      level,
      questions: Array.from({ length: 5 }, (_, i) => ({
        question: `${subject} ${level} section question ${i}`,
        options: ['a', 'b', 'c', 'd'],
        correctOptionIndex: 0,
      })),
    }));
    return { diagnosticQuiz, modules, sectionAssessments, relatedTopics: ['A', 'B', 'C'] };
  }

  let callCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    callCount += 1;
    if (callCount < 3) {
      // First two attempts: malformed JSON, simulating the real failure.
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"diagnosticQuiz": [truncated...' } }] }) };
    }
    // Third attempt: a valid response.
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validPayload('RetryTestSubject')) } }],
      }),
    };
  };

  try {
    const result = await generateRegistrationContent('RetryTestSubject');
    assert.equal(callCount, 3, 'should have retried twice before succeeding on the third attempt');
    assert.equal(result.diagnosticQuiz.length, 10);
    assert.equal(result.modules.length, 9);
    console.log(`  -> confirmed: recovered from 2 malformed responses via retry, succeeded on attempt 3 (MAX_ATTEMPTS=${MAX_ATTEMPTS})`);
  } finally {
    global.fetch = originalFetch;
  }
});

test('generateRegistrationContent gives up cleanly after MAX_ATTEMPTS consecutive failures', async () => {
  const { generateRegistrationContent } = require('../src/server/services/aiContentGenerator');

  let callCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    callCount += 1;
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }) };
  };

  try {
    await assert.rejects(() => generateRegistrationContent('AlwaysFailsSubject'));
    assert.equal(callCount, MAX_ATTEMPTS, `should attempt exactly ${MAX_ATTEMPTS} times, not loop forever or give up early`);
    console.log(`  -> confirmed: gives up after exactly ${MAX_ATTEMPTS} attempts rather than retrying forever`);
  } finally {
    global.fetch = originalFetch;
  }
});
