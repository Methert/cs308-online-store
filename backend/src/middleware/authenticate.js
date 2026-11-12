// The "doorman": before a request reaches the real code, checks that the user is logged in.
// The frontend must send this header with every such request:  Authorization: Bearer <token>
// On success req.user = { id, role }, and the code that follows can use it.
const { AppError } = require('../utils/AppError');

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

function readBearerToken(req) {
  const header = req.get('authorization');
  if (!header) return null;
  const match = BEARER_PATTERN.exec(header.trim());
  // The header exists but has the wrong format: return an empty string; the caller treats it
  // as "invalid".
  return match ? match[1] : '';
}

function toAuthError(err) {
  if (err && err.name === 'TokenExpiredError') {
    return new AppError(401, 'Session expired, please log in again');
  }
  return new AppError(401, 'Invalid authentication token');
}

function createAuthMiddleware(tokenService) {
  // Login REQUIRED: returns 401 if the token is missing or invalid.
  // Example: router.get('/me', authenticate, handler)
  function authenticate(req, res, next) {
    const token = readBearerToken(req);
    if (token === null) {
      return next(new AppError(401, 'Authentication required'));
    }
    if (token === '') {
      return next(new AppError(401, 'Invalid authentication token'));
    }
    try {
      req.user = tokenService.verify(token);
      return next();
    } catch (err) {
      return next(toAuthError(err));
    }
  }

  // Login OPTIONAL: for places where guests are allowed too (guest cart, live support).
  // Without a token req.user = null and the request continues.
  // With an invalid token it returns 401, so the frontend notices an expired session.
  function optionalAuthenticate(req, res, next) {
    const token = readBearerToken(req);
    if (token === null) {
      req.user = null;
      return next();
    }
    return authenticate(req, res, next);
  }

  return { authenticate, optionalAuthenticate };
}

module.exports = { createAuthMiddleware };
