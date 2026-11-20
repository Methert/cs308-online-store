// Builds the Express app: security settings, JSON parsing, routes and error handling.
// It does NOT start the server (server.js does). Because of this split, tests can run the app
// without opening a real port and without a real database.
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { createTokenService } = require('./utils/tokenService');
const { createAuthMiddleware } = require('./middleware/authenticate');
const { requireRole } = require('./middleware/requireRole');
const { notFound, createErrorHandler } = require('./middleware/errorHandler');
const { createAuthService } = require('./services/auth.service');
const { createAuthRouter } = require('./routes/auth.routes');
const { createHealthRouter } = require('./routes/health.routes');
const { createCartRouter } = require('./routes/cart.routes');
const { createOrderRouter } = require('./routes/orders.routes');
const { ROLES } = require('./constants/roles');

/**
 * @param {object} options
 * @param {object} options.config          result of loadConfig()
 * @param {object} options.userRepository  createUserRepository(prisma), or a fake one in tests
 * @param {Function} options.checkDatabase function that runs "SELECT 1" on the database
 * @param {object} [options.prisma]        client for the other modules (cart, orders, ...)
 * @param {object} [options.logger]
 */
function createApp({ config, userRepository, checkDatabase, prisma = null, logger = console }) {
  const app = express();

  // --- General settings ------------------------------------------------------
  app.use(helmet()); // security headers (also hides X-Powered-By)
  app.use(cors({ origin: config.clientOrigins })); // only our frontend may call the API
  app.use(express.json({ limit: '100kb' })); // turns the JSON body into req.body

  // --- Shared parts ----------------------------------------------------------
  const tokenService = createTokenService(config.jwt);
  const { authenticate, optionalAuthenticate } = createAuthMiddleware(tokenService);
  const authService = createAuthService({
    userRepository,
    tokenService,
    saltRounds: config.bcryptRounds,
  });

  // Shared dependencies handed to the routers of the other team members.
  // See "Adding a module" in the README.
  const deps = { prisma, authenticate, optionalAuthenticate, requireRole, ROLES };

  // --- Routes ----------------------------------------------------------------
  // Card pictures (public/images), for example /images/cards/sv03.5/199.webp.
  // helmet only lets the API's own origin load files; the React app runs on another port, so this
  // route allows cross-origin loading.
  app.use(
    '/images',
    (req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.join(__dirname, '..', 'public', 'images'), { maxAge: '7d' }),
  );
  app.use('/api/health', createHealthRouter({ checkDatabase }));
  app.use(
    '/api/auth',
    createAuthRouter({ authService, authenticate, rateLimitPerWindow: config.authRateLimit }),
  );
  app.use('/api/cart', createCartRouter(deps));
  app.use('/api/orders', createOrderRouter(deps));
  // Example (products):  app.use('/api/products', createProductRouter(deps));

  // --- Last: unknown URLs and the error handler ------------------------------
  app.use(notFound);
  app.use(createErrorHandler({ logger }));

  return app;
}

module.exports = { createApp };
