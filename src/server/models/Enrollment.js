'use strict';

const mongoose = require('mongoose');

const diagnosticQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctOptionIndex: { type: Number, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  },
  { _id: false }
);

const sectionAttemptSchema = new mongoose.Schema(
  {
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    passed: { type: Boolean, required: true },
    attemptedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * An Enrollment represents one learner's journey through one subject.
 * A single User can have many Enrollments (one per subject), allowing
 * multiple courses on one account without a new registration each time.
 *
 * Progress is tracked per SECTION (a proficiency tier's 3 modules), not
 * per module: unlockedSectionsCount is how many sections are currently
 * readable (sections stay unlocked permanently once reached, so earlier
 * modules remain available for review), and sectionAttempts records
 * every section-assessment attempt (pass or fail) for evaluation.
 */
const enrollmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    diagnosticQuiz: {
      type: [diagnosticQuestionSchema],
      default: [],
    },
    diagnosticCompleted: {
      type: Boolean,
      default: false,
    },
    diagnosticScore: {
      type: Number,
      default: null,
    },
    proficiencyLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', null],
      default: null,
    },
    currentPath: {
      type: [String],
      default: [],
    },
    unlockedSectionsCount: {
      type: Number,
      default: 0, // becomes 1 once the diagnostic is scored
    },
    sectionAttempts: {
      type: [sectionAttemptSchema],
      default: [],
    },
    lastAssessmentScore: {
      type: Number,
      default: null,
    },
    relatedTopics: {
      type: [String],
      default: [],
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'lastUpdated' } }
);

enrollmentSchema.index({ userId: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
