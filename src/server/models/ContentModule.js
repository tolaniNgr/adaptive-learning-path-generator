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
    assessmentQuestions: { type: [assessmentQuestionSchema], required: true },
    generatedBy: { type: String, default: 'gpt-4o' },
  },
  { timestamps: true }
);

contentModuleSchema.index({ subject: 1, level: 1, sequence: 1 });

module.exports = mongoose.model('ContentModule', contentModuleSchema);
