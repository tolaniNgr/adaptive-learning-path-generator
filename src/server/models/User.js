'use strict';

const mongoose = require('mongoose');

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
    subject: {
      type: String,
      required: true,
      trim: true,
      // The subject the learner registered for, e.g. "Introduction to Computing".
      // AI content generation (Section 3.7.6) runs once for this subject at registration.
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
