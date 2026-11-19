// GET /api/health -> are the server and the database up?
// The first endpoint everyone tries: the answer to "is the backend running?".
const express = require('express');

function createHealthRouter({ checkDatabase }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      await checkDatabase();
      res.status(200).json({ data: { status: 'ok', database: 'up' } });
    } catch {
      res.status(503).json({ error: 'Database is unavailable' });
    }
  });

  return router;
}

module.exports = { createHealthRouter };
