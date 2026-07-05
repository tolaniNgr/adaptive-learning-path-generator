'use strict';

/**
 * aiContentGenerator.js
 *
 * Invokes the OpenAI GPT-4o API exactly once, at learner registration, to
 * produce nine subject-specific learning modules (three per proficiency
 * tier), each with lesson content (standard and text-only variants) and
 * one assessment question. This is the real implementation of the module
 * described in Chapter 3, Section 3.7.6.
 *
 * Requires OPENAI_API_KEY to be set — this file cannot be executed without
 * real network access and a real API key, but is otherwise complete and
 * ready to run as-is.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o';

function buildPrompt(subject) {
  return `You are a curriculum designer generating self-contained learning modules for a low-bandwidth mobile learning app.

Generate exactly 9 learning modules for the subject "${subject}": 3 modules for each of the proficiency levels Beginner, Intermediate, and Advanced.

For each module, provide:
- "level": one of "Beginner", "Intermediate", "Advanced"
- "sequence": 1, 2, or 3 (position within that level)
- "contentStandard": 400-600 words of lesson content in HTML (headings, paragraphs), appropriate to the level
- "contentTextOnly": a plain-text version of the same lesson, under 150 words, preserving the core teaching point
- "assessmentQuestions": exactly one multiple-choice question with "question", "options" (array of 4 strings), and "correctOptionIndex" (0-based)

Respond with ONLY a JSON array of 9 objects matching this schema, and no other text, markdown formatting, or code fences.`;
}

/**
 * Calls the GPT-4o API and returns the parsed array of 9 module objects.
 * @param {string} subject - the learner-specified subject, e.g. "Introduction to Computing"
 * @returns {Promise<Array<object>>}
 */
async function generateModulesForSubject(subject) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.example to .env and set a real key.');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: buildPrompt(subject) }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`OpenAI API request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI API response did not contain generated content.');
  }

  let modules;
  try {
    const parsed = JSON.parse(raw);
    // Some models wrap the array in a top-level object (e.g. { modules: [...] })
    // when response_format is json_object, since that mode requires a JSON object,
    // not a bare array; handle both shapes defensively.
    modules = Array.isArray(parsed) ? parsed : parsed.modules || Object.values(parsed)[0];
  } catch (err) {
    throw new Error(`Failed to parse AI-generated content as JSON: ${err.message}`);
  }

  if (!Array.isArray(modules) || modules.length !== 9) {
    throw new Error(
      `Expected 9 generated modules, got ${Array.isArray(modules) ? modules.length : typeof modules}. ` +
        'Content was not independently validated by a subject-matter expert before storage (see Chapter 1, Limitation 4).'
    );
  }

  return modules.map((m, i) => ({
    subject,
    level: m.level,
    sequence: m.sequence,
    moduleId: `${subject}-${m.level}-${m.sequence}`.toLowerCase().replace(/\s+/g, '-'),
    contentStandard: m.contentStandard,
    contentTextOnly: m.contentTextOnly,
    assessmentQuestions: m.assessmentQuestions,
    generatedBy: MODEL,
  }));
}

module.exports = { generateModulesForSubject, buildPrompt };
