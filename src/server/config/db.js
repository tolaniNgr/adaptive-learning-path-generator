'use strict';

const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI in process.env.MONGODB_URI.
 * Fails fast with a clear error if the URI is missing, rather than
 * hanging silently — this project requires a real MongoDB instance
 * (local mongod or Atlas) to run.
 */
async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env and set a real MongoDB connection string.'
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  return mongoose.connection;
}

module.exports = { connectToDatabase };
