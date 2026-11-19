// Role check: "You are logged in, but are you allowed to do this?"
// Always used AFTER authenticate:
//   router.post('/products', authenticate, requireRole(ROLES.PRODUCT_MANAGER), handler)
// Several roles can be given: requireRole(ROLES.PRODUCT_MANAGER, ROLES.SALES_MANAGER)
const { AppError } = require('../utils/AppError');
const { ALL_ROLES } = require('../constants/roles');

function requireRole(...allowedRoles) {
  // Catch a misspelled role name when the server starts (e.g. 'product-manager').
  if (allowedRoles.length === 0) {
    throw new Error('requireRole needs at least one role');
  }
  for (const role of allowedRoles) {
    if (!ALL_ROLES.includes(role)) {
      throw new Error(`Unknown role in requireRole: "${role}"`);
    }
  }

  return function checkRole(req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };
}

module.exports = { requireRole };
