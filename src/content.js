'use strict';

// Representative "Introduction to Computing" (Beginner tier) lesson content,
// used to produce realistic standard vs. text-only payload sizes for the
// bandwidth-aware delivery test. This is illustrative test content authored
// for this build, not AI-generated output (the real AI Content Generation
// module in src/ai-content-generator.js produces the actual per-learner
// modules via the GPT-4o API).

const LESSON_PARAGRAPHS = [
  'A computer is an electronic device that accepts data as input, processes that data according to a set of instructions, and produces information as output. Every computer system, from a smartphone to a data centre server, is built around this same input-process-output cycle.',
  'The physical components of a computer are called hardware. Hardware includes the central processing unit (CPU), which carries out instructions; memory (RAM), which temporarily holds data the CPU is actively working with; and storage devices such as solid-state drives, which retain data even when the power is switched off.',
  'Software refers to the instructions that tell hardware what to do. There are two broad categories of software: system software, such as an operating system, which manages hardware resources and provides a platform for other programs to run; and application software, such as a word processor or web browser, which performs specific tasks for the user.',
  'Data inside a computer is represented in binary form, using only the digits 0 and 1. Each binary digit is called a bit, and a group of eight bits is called a byte. All text, images, audio, and video are ultimately stored and processed as sequences of bits, even though they appear to us as words, pictures, and sounds.',
  'An algorithm is a precise, step-by-step set of instructions for solving a problem or completing a task. Computer programs are written by translating algorithms into a programming language that a computer can execute. Good algorithms are correct, efficient, and easy for other people to understand and maintain.',
  'Networks allow computers to communicate with one another by exchanging data. The internet is a global network of networks, connecting billions of devices. When you load a web page, your device sends a request over the network to a server, and the server sends back the requested content, which your browser then displays.',
];

const KNOWLEDGE_CHECK = {
  question: 'A byte is made up of how many bits?',
  options: ['4', '8', '16', '32'],
  answerIndex: 1,
};

function renderStandardHtml() {
  const sections = LESSON_PARAGRAPHS.map(
    (para, i) => `
      <section class="lesson-section">
        <h2>Section ${i + 1}</h2>
        <p>${para}</p>
      </section>`
  ).join('\n');

  const diagram = `
    <figure>
      <svg viewBox="0 0 300 100" width="300" height="100" role="img" aria-label="Input, process, output diagram">
        <rect x="5" y="30" width="80" height="40" fill="#e8f3ec" stroke="#1d5c3a" />
        <text x="45" y="55" text-anchor="middle" font-size="12">Input</text>
        <rect x="110" y="30" width="80" height="40" fill="#e8f3ec" stroke="#1d5c3a" />
        <text x="150" y="55" text-anchor="middle" font-size="12">Process</text>
        <rect x="215" y="30" width="80" height="40" fill="#e8f3ec" stroke="#1d5c3a" />
        <text x="255" y="55" text-anchor="middle" font-size="12">Output</text>
        <line x1="85" y1="50" x2="110" y2="50" stroke="#1d5c3a" stroke-width="2" />
        <line x1="190" y1="50" x2="215" y2="50" stroke="#1d5c3a" stroke-width="2" />
      </svg>
      <figcaption>Figure: the input-process-output cycle.</figcaption>
    </figure>`;

  return `
    <article class="lesson standard">
      <h1>Introduction to Computing &mdash; Beginner Module 1</h1>
      ${diagram}
      ${sections}
      <section class="knowledge-check">
        <h2>Knowledge Check</h2>
        <p>${KNOWLEDGE_CHECK.question}</p>
        <ul>
          ${KNOWLEDGE_CHECK.options.map((opt) => `<li><label><input type="radio" name="kc1" /> ${opt}</label></li>`).join('\n')}
        </ul>
      </section>
    </article>`;
}

function renderTextOnly() {
  const body = LESSON_PARAGRAPHS.map((para, i) => `${i + 1}. ${para}`).join('\n\n');
  const options = KNOWLEDGE_CHECK.options.map((opt, i) => `${String.fromCharCode(97 + i)}) ${opt}`).join('  ');
  return `Introduction to Computing - Beginner Module 1\n\n${body}\n\nKnowledge Check: ${KNOWLEDGE_CHECK.question}\n${options}`;
}

module.exports = { renderStandardHtml, renderTextOnly, LESSON_PARAGRAPHS, KNOWLEDGE_CHECK };
