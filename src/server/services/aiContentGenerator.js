'use strict';

/**
 * aiContentGenerator.js
 *
 * Invokes the Google Gemini API at learner registration to produce FOUR
 * things in a single call (Section 3.7.6):
 *   1. A 10-question diagnostic quiz for the subject, difficulty
 *      progressing easy -> medium -> hard, used to classify the learner's
 *      starting proficiency tier.
 *   2. Nine subject-specific learning modules (three per proficiency
 *      tier), each with standard and text-only content variants.
 *   3. Three SECTION assessments (one per proficiency tier), each with
 *      at least 5 questions, covering all 3 modules in that tier. This
 *      tests recall after reading a whole section rather than allowing
 *      answers to be looked up against content still on screen, which a
 *      single question immediately after each module would not test.
 *   4. Four to five related topics the learner might study next.
 *
 * Uses Gemini's OpenAI-compatible endpoint (ai.google.dev/gemini-api/docs/openai).
 * Requires GEMINI_API_KEY to be set — this file cannot be executed without
 * real network access and a real API key, but is otherwise complete and
 * ready to run as-is.
 *
 * Content length: standard-mode lessons are intentionally substantial
 * (900-1,200 words) since standard mode is only served when bandwidth is
 * good. Text-only content is deliberately kept short (200-250 words) to
 * preserve the low-bandwidth design goal for learners who need text-only
 * delivery — a considered tradeoff, not an oversight.
 *
 * Resilience: a single call asks for a large JSON response (quiz, nine
 * long modules, three section assessments, related topics), which
 * occasionally comes back with one malformed character escape somewhere
 * in the text — a known characteristic of large structured LLM outputs,
 * not a deterministic bug. Defences: a best-effort repair of the most
 * common cause (an unescaped backslash), a retry of the whole call (up to
 * MAX_ATTEMPTS), and reasoning disabled with an explicit generous token
 * budget, since Gemini 2.5 Flash's internal "thinking" tokens otherwise
 * draw from the same budget as the visible response and can leave a
 * request this large with an empty answer.
 */

const { buildModuleId, MIN_SECTION_ASSESSMENT_QUESTIONS, LEVEL_ORDER } = require('../../adaptive-engine');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = 'gemini-2.5-flash';
const MAX_ATTEMPTS = 3;

/**
 * Repairs the single most common cause of "Bad escaped character in JSON"
 * errors from large LLM-generated JSON responses: a backslash that isn't
 * part of a valid JSON escape sequence.
 */
function repairInvalidJsonEscapes(raw) {
  return raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    try {
      return JSON.parse(repairInvalidJsonEscapes(raw));
    } catch (repairErr) {
      throw err;
    }
  }
}

function buildPrompt(subject) {
  return `You are a curriculum designer generating a complete learning package for a low-bandwidth mobile adaptive learning app, for the subject "${subject}".

Produce a single JSON object with exactly four top-level keys: "diagnosticQuiz", "modules", "sectionAssessments", and "relatedTopics".

1. "diagnosticQuiz": exactly 10 multiple-choice questions that test a learner's existing knowledge of "${subject}", used to classify their starting proficiency level BEFORE they see any lesson content. Order them from easiest to hardest: questions 1-3 "easy", 4-7 "medium", 8-10 "hard". Each question must have: "question" (string), "options" (array of exactly 4 strings), "correctOptionIndex" (0-based number), and "difficulty" ("easy", "medium", or "hard").

2. "modules": exactly 9 learning modules, 3 for each proficiency level "Beginner", "Intermediate", "Advanced". Each module must have:
   - "level": "Beginner", "Intermediate", or "Advanced"
   - "sequence": 1, 2, or 3 (position within that level)
   - "contentStandard": a THOROUGH, comprehensive lesson of 900-1,200 words in HTML (multiple headings, paragraphs, and where useful a short example), appropriate to the level.
   - "contentTextOnly": a concise plain-text version of the same lesson, 200-250 words, preserving the core teaching points for learners on very slow connections.

3. "sectionAssessments": exactly 3 objects, one per proficiency level ("Beginner", "Intermediate", "Advanced"). Each must have:
   - "level": the proficiency level this assessment covers
   - "questions": an array of AT LEAST ${MIN_SECTION_ASSESSMENT_QUESTIONS} multiple-choice questions covering material from ALL THREE modules of that level (not just one), designed to test whether the learner actually retained the material after reading all three, not whether they can find the answer by glancing back at one module. Each question needs "question", "options" (array of 4 strings), and "correctOptionIndex" (0-based).

4. "relatedTopics": an array of 4-5 short strings naming related subjects a learner who completes "${subject}" might want to study next.

Respond with ONLY the JSON object described above, and no other text, markdown formatting, or code fences. Ensure every string is valid JSON: escape any backslash as \\\\ and any double quote inside a string as \\".`;
}

async function callGeminiOnce(subject, apiKey) {
  const response = await fetch(GEMINI_API_URL, {
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
      max_tokens: 32768,
      reasoning_effort: 'none',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini API request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const raw = choice?.message?.content;
  if (!raw) {
    throw new Error(
      `Gemini API response did not contain generated content ` +
        `(finish_reason=${choice?.finish_reason ?? 'unknown'}, usage=${JSON.stringify(data.usage ?? {})}).`
    );
  }

  let parsed;
  try {
    parsed = tryParseJson(raw);
  } catch (err) {
    throw new Error(`Failed to parse AI-generated content as JSON: ${err.message}`);
  }

  const { diagnosticQuiz, modules, sectionAssessments, relatedTopics } = parsed;

  if (!Array.isArray(diagnosticQuiz) || diagnosticQuiz.length !== 10) {
    throw new Error(`Expected 10 diagnostic quiz questions, got ${Array.isArray(diagnosticQuiz) ? diagnosticQuiz.length : typeof diagnosticQuiz}.`);
  }
  if (!Array.isArray(modules) || modules.length !== 9) {
    throw new Error(
      `Expected 9 generated modules, got ${Array.isArray(modules) ? modules.length : typeof modules}. ` +
        'Content was not independently validated by a subject-matter expert before storage (see Chapter 1, Limitation 4).'
    );
  }
  if (!Array.isArray(sectionAssessments) || sectionAssessments.length !== 3) {
    throw new Error(`Expected 3 section assessments, got ${Array.isArray(sectionAssessments) ? sectionAssessments.length : typeof sectionAssessments}.`);
  }
  for (const level of LEVEL_ORDER) {
    const assessment = sectionAssessments.find((a) => a.level === level);
    if (!assessment) {
      throw new Error(`Missing section assessment for level "${level}".`);
    }
    if (!Array.isArray(assessment.questions) || assessment.questions.length < MIN_SECTION_ASSESSMENT_QUESTIONS) {
      throw new Error(
        `Section assessment for "${level}" needs at least ${MIN_SECTION_ASSESSMENT_QUESTIONS} questions, got ${
          Array.isArray(assessment.questions) ? assessment.questions.length : typeof assessment.questions
        }.`
      );
    }
  }
  if (!Array.isArray(relatedTopics) || relatedTopics.length < 3) {
    throw new Error(`Expected at least 3 related topics, got ${Array.isArray(relatedTopics) ? relatedTopics.length : typeof relatedTopics}.`);
  }

  return {
    diagnosticQuiz,
    relatedTopics,
    sectionAssessments: sectionAssessments.map((a) => ({
      subject,
      level: a.level,
      sectionKey: `${subject}::${a.level}`,
      questions: a.questions,
    })),
    modules: modules.map((m) => ({
      subject,
      level: m.level,
      sequence: m.sequence,
      moduleId: buildModuleId(subject, m.level, m.sequence),
      contentStandard: m.contentStandard,
      contentTextOnly: m.contentTextOnly,
      generatedBy: MODEL,
    })),
  };
}

/**
 * Calls the Gemini API and returns the parsed diagnostic quiz, modules,
 * section assessments, and related topics for a subject, retrying up to
 * MAX_ATTEMPTS times if the response comes back malformed.
 * @param {string} subject - the learner-specified subject, e.g. "Fiscal Policy"
 */
async function generateRegistrationContent(subject) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Copy .env.example to .env and set a real key.');
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callGeminiOnce(subject, apiKey);
    } catch (err) {
      lastError = err;
      console.error(`AI content generation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err.message);
    }
  }
  throw lastError;
}

module.exports = { generateRegistrationContent, buildPrompt, repairInvalidJsonEscapes, MAX_ATTEMPTS };
