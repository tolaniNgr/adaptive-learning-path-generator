# Low-Bandwidth Mobile Adaptive Learning Path Generator

Implementation supporting the final year project *"Design of a Mobile
Adaptive Learning Path Generator for Low-Bandwidth Environments"*
(Ilori Samson Omotola, 2023/C/SENG/0346, Miva Open University).

## What's actually verified vs. what needs real infrastructure

This codebase was developed and tested in a sandboxed environment with
**no internet access**. Two categories of result follow from that:

**Genuinely tested, real results:**
- `src/adaptive-engine.js` — the rule-based classification and routing
  engine. Pure JavaScript, no external dependencies, fully exercised by
  `tests/adaptive-engine.test.js` (28 assertions, all passing).
- `src/bandwidth-monitor.js` + `public/*` (PWA shell, service worker) —
  load-tested in a real headless Chromium browser under real simulated
  2G/3G network throttling via `tests/performance_test.py`. See Chapter
  Four for the measured load times and data transfer figures this
  produced.
- `src/server/**` (Express app, MongoDB models, JWT auth, bcrypt hashing,
  GPT-4o integration) — the actual route logic was integration-tested via
  `tests/backend-integration.test.js`, using in-memory substitutes for
  MongoDB and the OpenAI API (since this sandbox couldn't reach either),
  and Node's built-in crypto module standing in for the native
  bcrypt/jsonwebtoken bindings. This verifies the business logic is
  correct; it does not verify the real MongoDB driver or the real OpenAI
  API integration, which is exactly what the steps below let you confirm.

**Needs you to run it for real:**
- A real MongoDB instance (local or Atlas)
- A real OpenAI API key with GPT-4o access
- `npm install` against the real npm registry
- Real SUS usability data from real participants — nothing can substitute
  for this

## Project structure

```
src/
  adaptive-engine.js       # Rule-based classification + path routing (client AND server)
  bandwidth-monitor.js     # Bandwidth probe + mode switching (client)
  content.js               # Local test content used by local-test-server.js
  local-test-server.js     # Minimal server used ONLY for sandbox testing — not for production
  server/                  # The real backend
    server.js              # Entry point
    app.js                 # Express app (also serves public/ as static files)
    config/db.js
    models/                # User, LearnerProfile, ContentModule
    routes/                # auth, content, profile
    middleware/auth.js     # JWT-as-httpOnly-cookie
    services/aiContentGenerator.js  # GPT-4o integration
    package.json
    .env.example
public/                    # PWA shell: index.html, app.js, sw.js, manifest.json, styles
diagrams/                  # Class + sequence diagrams (.mmd source and rendered .png)
tests/
  adaptive-engine.test.js       # Real, run with `node --test`
  backend-integration.test.js   # Real, run with `node --test` (uses in-memory fakes — see below)
  performance_test.py           # Real, run with `python3` (needs playwright + chromium)
```

Note: `tests/backend-integration.test.js` depends on test-only fake
packages that are **not included in this zip** (they exist only to let
route logic run without live MongoDB/OpenAI access in an offline
sandbox). To run real backend tests, use a real testing setup (e.g.
`mongodb-memory-server` + `nock` or `supertest`) against real `npm
install`ed dependencies — the point of that test suite was to verify the
route logic once; you don't need to reproduce the fakes to trust the
result, but you'll want your own tests as the project evolves.

## Running it for real

```bash
cd src/server
npm install
cp .env.example .env
# Edit .env with:
#   MONGODB_URI      - local mongod URI or MongoDB Atlas connection string
#   JWT_SECRET        - generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   OPENAI_API_KEY    - a real key with gpt-4o access
npm start
```

Then visit `http://localhost:3000` — the same server serves both the API
and the PWA (registration form, adaptive engine, bandwidth switching,
offline caching).

## Running the tests that don't need any setup

```bash
# From the project root:
node --test tests/adaptive-engine.test.js
```

This runs immediately with no dependencies, no network, and no
credentials — it's pure logic.

## What to do next (for the report / VIVA)

1. Push this to a real Git repository and reference it in Appendix B.
2. Get MongoDB + an OpenAI API key, run `npm start`, and do one real
   registration yourself as a smoke test.
3. Deploy somewhere reachable (Render, Railway, Fly.io all have free
   tiers) if you want participants to access it without using your own
   machine.
4. Run a real SUS usability session with 10 real participants against the
   real, deployed system.
5. Send the real repository URL back so the deployment paragraph in
   Chapter Three can reference it instead of a placeholder.
