// backend/routes/votess.js
const express = require('express');
const { getPool } = require('../db');
const { readJwtUserId } = require('../utils/auth');
// 🟢 FIX: Import AI Services
const { logInteraction, getDashboardRecommendations } = require('../services/aiHub');

const router = express.Router();

// --- Helpers ---
const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

async function loadPollWithOptions(pollId) {
  const { rows: pollRows } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at
       FROM polls WHERE id = $1`, [pollId]
  );

  if (!pollRows.length) return null;
  const poll = pollRows[0];

  const { rows: optionRows } = await getPool().query(
    `SELECT id, label FROM poll_options WHERE poll_id = $1 ORDER BY created_at ASC`,
    [pollId]
  );

  return { ...poll, options: optionRows };
}

// --- Routes ---

// GET /api/votess - list polls
router.get('/', async (req, res) => {
  try {
    const { rows: polls } = await getPool().query(
      `SELECT id, title, description, is_active, expires_at
         FROM polls
         WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC`
    );

    const pollIds = polls.map(p => p.id);
    if (pollIds.length === 0) {
      return res.json({ polls: [] });
    }

    const { rows: options } = await getPool().query(
      `SELECT id, poll_id, label FROM poll_options WHERE poll_id = ANY($1::int[]) ORDER BY created_at ASC`,
      [pollIds]
    );

    const optionsByPoll = options.reduce((acc, opt) => {
      if (!acc[opt.poll_id]) acc[opt.poll_id] = [];
      acc[opt.poll_id].push({ id: opt.id, label: opt.label });
      return acc;
    }, {});

    const pollsWithOptions = polls.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      expires_at: p.expires_at,
      options: optionsByPoll[p.id] || []
    }));

    res.json({ polls: pollsWithOptions });
  } catch (err) {
    console.error('Error loading polls:', err);
    res.status(500).json({ message: 'Unable to load polls' });
  }
});

// POST /api/votess/:pollId/vote - cast a vote
router.post('/:pollId/vote', async (req, res) => {
  const userId = readJwtUserId(req);
  console.log('Vote attempt - userId:', userId || 'anonymous');

  const pollId = toPositiveInt(req.params.pollId);
  const optionId = toPositiveInt(req.body?.option_id);

  if (!pollId || !optionId) {
    return res.status(400).json({ message: 'Invalid pollId or optionId.' });
  }

  try {
    const poll = await loadPollWithOptions(pollId);
    if (!poll) return res.status(404).json({ message: 'Poll not found.' });

    if (!poll.is_active || (poll.expires_at && new Date(poll.expires_at) <= new Date())) {
      return res.status(400).json({ message: 'This poll is no longer accepting votes.' });
    }

    const optionExists = poll.options.some(o => o.id === optionId);
    if (!optionExists) {
      return res.status(400).json({ message: 'Option does not belong to this poll.' });
    }

    // Different handling for authenticated vs anonymous users
    if (userId) {
      // For authenticated users, check if they already voted
      const { rows: existingVotes } = await getPool().query(
        `SELECT id, option_id FROM poll_votes WHERE user_id = $1 AND poll_id = $2`,
        [userId, pollId]
      );

      if (existingVotes.length > 0) {
        // Update existing vote
        await getPool().query(
          `UPDATE poll_votes 
           SET option_id = $1, created_at = NOW() 
           WHERE user_id = $2 AND poll_id = $3`,
          [optionId, userId, pollId]
        );
      } else {
        // Insert new vote
        await getPool().query(
          `INSERT INTO poll_votes (poll_id, option_id, user_id)
           VALUES ($1, $2, $3)`,
          [pollId, optionId, userId]
        );
      }

      // 🟢 FIX 1: Log Interaction with CORRECT Type
      logInteraction({
        userId,
        contentId: pollId,        // Send the Poll ID
        contentType: 'poll',      // Explicitly say this is a poll
        action: 'vote',
        timestamp: new Date().toISOString()
      }).catch(err => console.warn('Failed to log vote interaction:', err.message));

      // 🟢 FIX 2: Trigger Regeneration (No change needed here, this is already correct)
      getDashboardRecommendations({ 
        userId, 
        useCache: false 
      }).catch(err => console.warn('Failed to regenerate suggestions:', err.message));
      
    } else {
      // For anonymous users, just insert (allows multiple anonymous votes)
      await getPool().query(
        `INSERT INTO poll_votes (poll_id, option_id, user_id)
         VALUES ($1, $2, NULL)`,
        [pollId, optionId]
      );
    }

    const refreshedPoll = await loadPollWithOptions(pollId);
    res.json({ poll: refreshedPoll, success: true });
  } catch (err) {
    console.error('Error recording vote:', err);
    console.error('Error details:', err.message, err.stack);
    res.status(500).json({ message: 'Unable to record vote', error: err.message });
  }
});

module.exports = router;