'use strict';

const mongoose = require('mongoose');

const assessmentQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctOptionIndex: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * One assessment per (subject, level) pair, covering all 3 modules of
 * that proficiency tier. correctOptionIndex is never sent to the client
 * before scoring — routes/enrollments.js scores server-side.
 */
const sectionAssessmentSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },
    // A computed unique key (subject::level) rather than relying solely on
    // a compound index, so duplicate-insert detection works the same way
    // ContentModule's unique moduleId does.
    sectionKey: { type: String, required: true, unique: true },
    questions: { type: [assessmentQuestionSchema], required: true },
  },
  { timestamps: true }
);

sectionAssessmentSchema.index({ subject: 1, level: 1 }, { unique: true });

module.exports = mongoose.model('SectionAssessment', sectionAssessmentSchema);
