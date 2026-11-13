// Reads and validates the settings from the .env file.
// If a setting is missing or invalid, the server does not start and says why
// ("fail fast": catch the problem at startup, not while the app is running).
const { z } = require('zod');

// Duration format accepted by jsonwebtoken: "3600" (seconds), "15m", "12h", "1d", "7d"...
const DURATION_PATTERN = /^\d+(ms|s|m|h|d|w|y)?$/;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string({ error: 'DATABASE_URL is required' }).min(1, 'DATABASE_URL is required'),
  // Set to "true" if Supabase requires SSL and the app cannot connect (not needed locally).
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(DURATION_PATTERN, 'JWT_EXPIRES_IN must look like 15m, 12h or 1d')
    .default('1d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
});

function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }

  const e = result.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseSsl: e.DATABASE_SSL === 'true',
    jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
    bcryptRounds: e.BCRYPT_ROUNDS,
    // Several origins can be given, separated by commas: "http://localhost:5173,https://site.com"
    clientOrigins: e.CLIENT_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    // Login/register requests allowed per IP in 15 minutes
    authRateLimit: e.AUTH_RATE_LIMIT,
  };
}

module.exports = { loadConfig };
