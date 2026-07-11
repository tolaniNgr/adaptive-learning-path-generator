'use strict';

require('dotenv').config();

const { createApp } = require('./app');
const { connectToDatabase } = require('./config/db');

const PORT = process.env.PORT || 3000;

async function main() {
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY'];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
        'Copy .env.example to .env and fill in real values before starting the server.'
    );
    process.exit(1);
  }

  await connectToDatabase();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
