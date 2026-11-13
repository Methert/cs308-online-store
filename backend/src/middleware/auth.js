import supabase from '../db/supabase.js';

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7); // strip "Bearer "
  if (!token) return res.status(401).json({ error: 'Authorization header required' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  req.user = user;
  next();
}

export async function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return next();

  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) req.user = user;
  next();
}
