'use strict';

const mongoose = require('mongoose');

/**
 * A User now holds only account/auth information. Everything that used
 * to live here per-account (subject, diagnostic quiz, related topics) is
 * now per-Enrollment, since a single account can enroll in many subjects
 * without creating a new account or logging out for each one.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
