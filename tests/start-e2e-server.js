'use strict';

process.env.JWT_SECRET = 'e2e-test-secret';
process.env.MONGODB_URI = 'fake://in-memory';
process.env.GEMINI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

const path = require('node:path');

const { renderStandardHtml, renderTextOnly } = require('../src/content.js');

function buildCannedAiResponse(subject) {
  const diagnosticQuiz = [];
  const difficulties = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];
  for (let i = 0; i < 10; i++) {
    diagnosticQuiz.push({
      question: `${subject} diagnostic question ${i + 1}: what is the correct answer?`,
      options: ['Correct answer', 'Wrong B', 'Wrong C', 'Wrong D'],
      correctOptionIndex: 0,
      difficulty: difficulties[i],
    });
  }

  // Reuses the same realistic-length content (900-1200 words standard,
  // ~220 words text-only) used for the bandwidth performance test, so
  // both real browser tests measure production-representative payloads
  // rather than short placeholder strings.
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  const modules = [];
  for (const level of levels) {
    for (let sequence = 1; sequence <= 3; sequence++) {
      modules.push({
        level,
        sequence,
        contentStandard: renderStandardHtml().replace('Beginner Module 1', `${level} Module ${sequence}`),
        contentTextOnly: renderTextOnly().replace('Beginner Module 1', `${level} Module ${sequence}`),
        assessmentQuestions: [
          {
            question: `What is 2 + 2? (sample question for ${level} module ${sequence})`,
            options: ['3', '4', '5', '6'],
            correctOptionIndex: 1,
          },
        ],
      });
    }
  }

  const relatedTopics = [`Advanced ${subject}`, `${subject} in Practice`, `Introduction to ${subject} Tools`];

  return { diagnosticQuiz, modules, relatedTopics };
}

global.fetch = async (url, options) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
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
  throw new Error(`Unexpected fetch call to ${url}`);
};

const { createApp } = require('../src/server/app');
const { startRealServer } = require('./real-http-harness');

const PORT = 8091;
const app = createApp();
const publicDir = path.join(__dirname, '..', 'public');

startRealServer(app, publicDir, PORT).then(() => {
  console.log(`E2E test server listening on http://localhost:${PORT}`);
});
