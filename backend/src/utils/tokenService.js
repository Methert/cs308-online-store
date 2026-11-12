// Creating and verifying JWTs (login tokens).
// A token holds only the user's id (sub) and role. Data such as the password or email is never
// put in a token, because a token is not encrypted, only signed (anyone can read its content).
const jwt = require('jsonwebtoken');
const { ALL_ROLES } = require('../constants/roles');

const ALGORITHM = 'HS256';

function createTokenService({ secret, expiresIn }) {
  if (!secret) {
    throw new Error('JWT secret is required');
  }

  function sign(user) {
    return jwt.sign({ role: user.role }, secret, {
      subject: String(user.id),
      expiresIn,
      algorithm: ALGORITHM,
    });
  }

  // Throws for an invalid, expired or tampered token.
  function verify(token) {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });

    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0 || !ALL_ROLES.includes(payload.role)) {
      throw new jwt.JsonWebTokenError('Malformed token payload');
    }
    return { id, role: payload.role };
  }

  return { sign, verify };
}

module.exports = { createTokenService };
