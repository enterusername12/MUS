// src/routes/reco.js
const express = require('express');
const { logInteraction } = require('../services/aiHub');

const router = express.Router();

router.post('/interact', async (req, res) => {
  try {
    const { user_id, event_id, action, timestamp } = req.body || {};
    if (!user_id || !event_id || !action) {
      return res.status(400).json({ error: 'user_id, event_id, action are required' });
    }
    const out = await logInteraction({ userId: user_id, eventId: event_id, action, timestamp });
    res.json(out);
  } catch (err) {
    console.error('AI interact error:', err.message);
    res.json({ status: 'logged-local' });
  }
});

module.exports = router;
