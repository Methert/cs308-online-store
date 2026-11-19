// Endpoints under /api/auth
//   POST /api/auth/register  -> new customer account + token
//   POST /api/auth/login     -> login + token
//   GET  /api/auth/me        -> data of the logged-in user (profile page)
//
// There is no logout endpoint in the backend: a JWT is not stored on the server, so the user is
// logged out when the frontend deletes the token from localStorage.
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { validateBody } = require('../middleware/validateBody');
const { registerSchema, loginSchema } = require('../validators/auth.schemas');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function createAuthRouter({ authService, authenticate, rateLimitPerWindow }) {
  const router = express.Router();

  // Protection against password-guessing attacks: one IP may try at most N times per 15 minutes.
  const authLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: rateLimitPerWindow,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' },
  });

  router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json({ data: result });
  });

  router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
    const result = await authService.login(req.body);
    res.status(200).json({ data: result });
  });

  router.get('/me', authenticate, async (req, res) => {
    const user = await authService.getCurrentUser(req.user.id);
    res.status(200).json({ data: { user } });
  });

  return router;
}

module.exports = { createAuthRouter };
