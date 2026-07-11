'use strict';

// Representative "Introduction to Computing" (Beginner tier) lesson content,
// used to produce realistic standard vs. text-only payload sizes for the
// bandwidth-aware delivery test. Sized to match the real AI Content
// Generation module's targets (Section 3.7.6): standard content
// 900-1,200 words, text-only content 200-250 words as a genuinely
// condensed summary (not just the same text reused) — this is illustrative
// test content authored for this build, not AI-generated output.

const LESSON_PARAGRAPHS = [
  "A computer is an electronic device that accepts data as input, processes that data according to a set of instructions, and produces information as output. Every computer system, from a smartphone to a data centre server, is built around this same input-process-output cycle. Understanding this cycle is the foundation for understanding everything else about how computers work, from the simplest calculator to the most powerful supercomputer.",
  "The physical components of a computer are called hardware. Hardware includes the central processing unit (CPU), which carries out instructions; memory (RAM), which temporarily holds data the CPU is actively working with; and storage devices such as solid-state drives, which retain data even when the power is switched off. Other important hardware components include input devices like keyboards and touchscreens, and output devices like monitors and speakers.",
  "Software refers to the instructions that tell hardware what to do. There are two broad categories of software: system software, such as an operating system, which manages hardware resources and provides a platform for other programs to run; and application software, such as a word processor or web browser, which performs specific tasks for the user. Without software, hardware is simply inert electronic circuitry with no way to perform useful work.",
  "Data inside a computer is represented in binary form, using only the digits 0 and 1. Each binary digit is called a bit, and a group of eight bits is called a byte. All text, images, audio, and video are ultimately stored and processed as sequences of bits, even though they appear to us as words, pictures, and sounds. This is possible because every character, colour, and sound can be assigned a unique numeric code.",
  "An algorithm is a precise, step-by-step set of instructions for solving a problem or completing a task. Computer programs are written by translating algorithms into a programming language that a computer can execute. Good algorithms are correct, efficient, and easy for other people to understand and maintain. The study of algorithms, how to design them and how to measure their efficiency, is one of the core disciplines of computer science.",
  "Networks allow computers to communicate with one another by exchanging data. The internet is a global network of networks, connecting billions of devices. When you load a web page, your device sends a request over the network to a server, and the server sends back the requested content, which your browser then displays. This request-response pattern underlies almost everything you do online, from browsing to video calls.",
  "Programming languages provide a structured way for humans to write instructions that a computer can eventually execute. High-level languages, such as JavaScript or Python, are closer to human language and are easier to read and write, while low-level languages are closer to the instructions a processor executes directly. Most software today is written in high-level languages and then translated into low-level instructions by a compiler or interpreter.",
  "Operating systems manage a computer hardware resources and provide common services for the software running on it. They handle tasks such as scheduling which program gets access to the CPU next, managing memory so that programs do not interfere with one another, and providing a file system so that data can be organised and retrieved. Common examples include Windows, macOS, Linux, iOS, and Android.",
  "Data storage comes in different forms with different trade-offs. Primary storage, like RAM, is very fast but loses its contents when power is removed. Secondary storage, like solid-state or hard disk drives, is slower but retains data permanently. Cloud storage extends this further by keeping data on remote servers accessible over a network, which is especially relevant for mobile applications operating under variable connectivity.",
  "Security is a foundational concern in computing. Protecting data and systems involves multiple layers: authentication (confirming who a user is), authorisation (controlling what an authenticated user is allowed to do), and encryption (making data unreadable to anyone without the correct key). As more of daily life moves online, understanding these basic security concepts becomes increasingly important for every computer user, not just specialists.",
  "The history of computing spans from mechanical calculating devices in the 19th century, through room-sized electronic computers in the mid-20th century, to the powerful pocket-sized devices most people carry today. Each generation of hardware has been dramatically smaller, faster, and cheaper than the last, a trend often summarised by Moore's Law, the observation that the number of transistors on a chip roughly doubles every two years.",
  "Looking ahead, computing continues to evolve in directions such as artificial intelligence, which enables computers to perform tasks that once required human judgement, and edge computing, which moves processing closer to where data is generated rather than relying entirely on distant servers. Both trends are directly relevant to building responsive applications that work well even under constrained network conditions.",
];

const KNOWLEDGE_CHECK = {
  question: "A byte is made up of how many bits?",
  options: ["4", "8", "16", "32"],
  answerIndex: 1,
};

// A genuinely condensed summary (~220 words), not the same paragraphs
// reused, matching how the real AI Content Generation module produces a
// distinct text-only variant rather than truncating the standard version.
const TEXT_ONLY_SUMMARY =
  "A computer takes in data, processes it by following instructions, and produces output. The input-process-output cycle underlies every computer system. " +
  "Hardware is the physical parts: the CPU executes instructions, RAM temporarily holds active data, and storage (like SSDs) keeps data permanently. " +
  "Software is the instructions themselves: system software (like an operating system) manages hardware, while application software (like a browser) does specific tasks for you. " +
  "All data is ultimately stored as binary digits (bits); eight bits make a byte, and every kind of media, text, images, sound, is encoded this way. " +
  "An algorithm is a precise set of steps for solving a problem; programs are algorithms written in a programming language the computer can run. " +
  "Networks let computers exchange data. The internet connects billions of devices, and loading a webpage is a request-response exchange between your device and a server. " +
  "High-level languages like JavaScript and Python are easier for humans to write and get translated into low-level instructions by a compiler or interpreter. " +
  "Operating systems manage hardware resources, scheduling CPU time, managing memory, and organising files, with Windows, macOS, Linux, iOS, and Android as common examples. " +
  "Security relies on authentication, authorisation, and encryption to protect data and systems. " +
  "Computing has evolved from room-sized machines to pocket-sized devices, and continues evolving toward AI and edge computing, processing data closer to where it is generated, which matters directly for apps that need to work well on constrained networks.";

function renderStandardHtml() {
  const sections = LESSON_PARAGRAPHS.map(
    (para, i) => `
      <section class="lesson-section">
        <h2>Section ${i + 1}</h2>
        <p>${para}</p>
      </section>`
  ).join("\n");

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
          ${KNOWLEDGE_CHECK.options.map((opt) => `<li><label><input type="radio" name="kc1" /> ${opt}</label></li>`).join("\n")}
        </ul>
      </section>
    </article>`;
}

function renderTextOnly() {
  const options = KNOWLEDGE_CHECK.options.map((opt, i) => `${String.fromCharCode(97 + i)}) ${opt}`).join("  ");
  return `Introduction to Computing - Beginner Module 1\n\n${TEXT_ONLY_SUMMARY}\n\nKnowledge Check: ${KNOWLEDGE_CHECK.question}\n${options}`;
}

module.exports = { renderStandardHtml, renderTextOnly, LESSON_PARAGRAPHS, TEXT_ONLY_SUMMARY, KNOWLEDGE_CHECK };
