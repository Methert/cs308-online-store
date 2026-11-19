// Rules for the data sent when registering and logging in.
// Note: zod objects drop unknown fields. Even if someone registers with {"role": "sales_manager"},
// that field is removed and the account is always created as "customer".
const { z } = require('zod');

// bcrypt only uses the first 72 BYTES of a password and silently ignores the rest.
// Non-ASCII characters (such as Turkish letters) take 2 or more bytes, so we count bytes,
// not characters.
const BCRYPT_MAX_BYTES = 72;

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email is not valid' }).max(254, 'Email is too long'));

const newPassword = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES, {
    error: 'Password is too long',
  })
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), {
    error: 'Password must contain at least one letter and one digit',
  });

const registerSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long'),
  email,
  password: newPassword,
  // Project requirement 14: a customer must have a tax ID.
  // In Turkey a tax number has 10 digits and a national ID number has 11.
  taxId: z
    .string({ error: 'Tax ID is required' })
    .trim()
    .regex(/^\d{10,11}$/, 'Tax ID must be 10 or 11 digits'),
  homeAddress: z
    .string({ error: 'Home address is required' })
    .trim()
    .min(5, 'Home address is too short')
    .max(500, 'Home address is too long'),
});

const loginSchema = z.object({
  email,
  // Password rules are not applied at login (it only must not be empty or absurdly long).
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(200, 'Password is too long'),
});

module.exports = { registerSchema, loginSchema, BCRYPT_MAX_BYTES };
