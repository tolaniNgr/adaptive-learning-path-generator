'use strict';

/**
 * asyncHandler.js
 *
 * Express 4 does not automatically catch rejected promises thrown inside
 * async route handlers — an unhandled rejection there crashes the entire
 * Node process rather than just failing that one request. This wraps a
 * handler so any rejection is forwarded to next(err), which routes it to
 * the centralised error handler in app.js instead.
 *
 * Every route handler in routes/*.js is wrapped with this.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
