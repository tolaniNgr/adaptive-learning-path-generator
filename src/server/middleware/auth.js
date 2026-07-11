'use strict';

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'auth_token';
const TOKEN_EXPIRY = '24h';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * Sets the JWT as an httpOnly, Secure, SameSite=Strict cookie scoped to /api,
 * per the security fix discussed in Chapter 3, Section 3.8: this prevents
 * token exfiltration via XSS (JavaScript cannot read an httpOnly cookie),
 * and lets the service worker's background sync handler authenticate
 * replayed offline requests without custom postMessage plumbing, since the
 * browser attaches cookies automatically regardless of which context
 * (main thread or service worker) initiated the request.
 */
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours, matches TOKEN_EXPIRY
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/api' });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

module.exports = { COOKIE_NAME, signToken, setAuthCookie, clearAuthCookie, requireAuth };
