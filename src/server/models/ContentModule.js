'use strict';

const mongoose = require('mongoose');

/**
 * A single lesson module. Assessment no longer lives here — it moved to
 * the section level (see SectionAssessment.js), covering all 3 modules
 * of a proficiency tier at once rather than gating each module
 * individually.
 */
const contentModuleSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },
    sequence: { type: Number, required: true, min: 1, max: 3 },
    moduleId: { type: String, required: true, unique: true },
    contentStandard: { type: String, required: true },
    contentTextOnly: { type: String, required: true },
    generatedBy: { type: String, default: 'gemini-2.5-flash' },
  },
  { timestamps: true }
);

contentModuleSchema.index({ subject: 1, level: 1, sequence: 1 });

module.exports = mongoose.model('ContentModule', contentModuleSchema);
