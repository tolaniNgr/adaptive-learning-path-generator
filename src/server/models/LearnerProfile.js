'use strict';

const mongoose = require('mongoose');

const completedModuleSchema = new mongoose.Schema(
  {
    moduleId: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    passed: { type: Boolean, required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const learnerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    proficiencyLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },
    currentPath: {
      type: [String], // ordered array of moduleIds
      required: true,
    },
    completedModules: {
      type: [completedModuleSchema],
      default: [],
    },
    diagnosticScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    lastAssessmentScore: {
      type: Number,
      default: null,
    },
  },
  { timestamps: { createdAt: 'lastUpdated', updatedAt: 'lastUpdated' } }
);

// This server-side document is the durable, cross-device source of truth.
// The client additionally mirrors this structure into localStorage
// (see src/bandwidth-monitor.js / src/adaptive-engine.js consumers on the
// client) so that adaptive routing keeps working offline; the two are
// reconciled via the /api/profile/sync route when connectivity returns.
module.exports = mongoose.model('LearnerProfile', learnerProfileSchema);
