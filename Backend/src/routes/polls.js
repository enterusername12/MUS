const express = require('express');

const { getPool } = require('../db');
const { readJwtUserId } = require('../utils/auth');

const router = express.Router();

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const mapOptionRow = (option, fallbackPollId) => {
  const pollId = Number(option.poll_id) || fallbackPollId;
  const optionId = Number(option.id);

  return {
    id: Number.isInteger(optionId) ? optionId : option.id,
    poll_id: pollId,
    label: option.label,
    created_at: option.created_at,
    vote_count: Number(option.vote_count) || 0,
    name: option.label
  };
};

const loadPollWithOptions = async (pollId) => {
  const { rows: pollRows } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
       WHERE id = $1`,
    [pollId]
  );

  if (pollRows.length === 0) {
    return null;
  }

  const poll = pollRows[0];

  const { rows: optionRows } = await getPool().query(
    `SELECT
         o.id,
         o.poll_id,
         o.label,
         o.created_at,
         COUNT(v.id)::INT AS vote_count
       FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id
       ORDER BY o.created_at ASC, o.id ASC`,
    [pollId]
  );

  const options = optionRows.map((option) => mapOptionRow(option, pollId));

  return {
    ...poll,
    id: Number(poll.id) || poll.id,
    options
  };
};

const normalizeOptionLabels = (options) => {
  if (!Array.isArray(options)) {
    return { error: 'Options must be provided as an array.' };
  }

  if (options.length < 2 || options.length > 10) {
    return { error: 'Polls must include between 2 and 10 options.' };
  }

  const seen = new Set();
  const normalized = [];

  for (const rawOption of options) {
    if (rawOption === undefined || rawOption === null) {
      return { error: 'Poll options cannot be empty.' };
    }

    const label = String(rawOption).trim();
    if (!label) {
      return { error: 'Poll options cannot be blank.' };
    }

    const key = label.toLowerCase();
    if (seen.has(key)) {
      return { error: 'Poll options must be unique.' };
    }
    seen.add(key);
    normalized.push(label);
  }

  return { value: normalized };
};

const parseExpiresAt = (rawValue) => {
  if (!rawValue && rawValue !== 0) {
    return null;
  }

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.valueOf()) ? null : rawValue;
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    const fromNumber = new Date(rawValue);
    return Number.isNaN(fromNumber.valueOf()) ? null : fromNumber;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const isoCandidate = dateOnlyMatch ? `${trimmed}T23:59:59` : trimmed;
    const parsed = new Date(isoCandidate);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }

  return null;
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return fallback;
};

const readPollPayload = (body = {}) => {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const descriptionSource =
    typeof body.question === 'string'
      ? body.question
      : typeof body.question === 'string'
        ? body.question
        : '';
  const description = descriptionSource.trim();

  const { value: optionLabels, error: optionsError } = normalizeOptionLabels(body.options);
  if (!title) {
    return { error: 'Poll title is required.' };
  }

  // if (!description) {
  //   return { error: 'Poll description is required.' };
  // }

  if (optionsError) {
    return { error: optionsError };
  }

  const expiresAt = parseExpiresAt(body.expiresAt ?? body.expires_at);
  if (body.expiresAt !== undefined || body.expires_at !== undefined) {
    // if (!expiresAt) {
    //   return { error: 'expiresAt must be a valid ISO date/time string or YYYY-MM-DD.' };
    // }

    const now = new Date();
    // if (expiresAt <= now) {
    //   return { error: 'expiresAt must be set in the future.' };
    // }
  }

  const isActive = normalizeBoolean(body.isActive ?? body.is_active, true);

  return {
    value: {
      title,
      description,
      optionLabels,
      expiresAt,
      isActive
    }
  };
};

const parseIncludeInactive = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'all'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'active'].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return false;
};

const loadPollsWithOptions = async ({ includeInactive = false } = {}) => {
  const condition = includeInactive
    ? 'TRUE'
    : 'is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())';

  const { rows: polls } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
       WHERE ${condition}
       ORDER BY created_at DESC, id DESC`
  );

  if (polls.length === 0) {
    return [];
  }

  const pollIds = polls.map((poll) => poll.id);
  const { rows: options } = await getPool().query(
    `SELECT
         o.id,
         o.poll_id,
         o.label,
         o.created_at,
         COUNT(v.id)::INT AS vote_count
       FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
       WHERE o.poll_id = ANY($1::INT[])
       GROUP BY o.id
       ORDER BY o.created_at ASC, o.id ASC`,
    [pollIds]
  );

  const optionsByPoll = options.reduce((acc, option) => {
    const pollId = option.poll_id;
    if (!acc[pollId]) {
      acc[pollId] = [];
    }

    acc[pollId].push(mapOptionRow(option, pollId));

    return acc;
  }, {});

  return polls.map((poll) => ({
    ...poll,
    id: Number(poll.id) || poll.id,
    options: optionsByPoll[poll.id] || []
  }));
};

// ===== Routes =====

// List polls
router.get('/', async (req, res) => {

  const userId = readJwtUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const includeInactive = parseIncludeInactive(req.query?.includeInactive ?? req.query?.include_inactive);

  try {
    const polls = await loadPollsWithOptions({ includeInactive });
    return res.json({ polls });
  } catch (error) {
    console.error('Failed to load polls', error);
    return res.status(500).json({ message: 'Unable to load polls right now.' });
  }
});


// Create poll
router.post('/', async (req, res) => {
  console.log('--- Request Start ---');

  let pollId = req.body.id ?? null; // If id exists, this is an update

  const authHeader = req.headers['authorization'];
  let userId = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7); // remove "Bearer "
    try {
      const user = JSON.parse(token); // parse token into object
      userId = user.id;
    } catch (err) {
      console.error("Failed to parse Authorization header:", token, err);
    }
  }

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const userResult = await getPool().query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) {
      return res.status(401).json({ message: 'User not found.' });
    }

    const { value: payload, error } = readPollPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      if (!pollId) {
        // CREATE NEW POLL
        const pollInsert = await client.query(
          `INSERT INTO polls (title, description, is_active, expires_at)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
          [payload.title, payload.description, payload.isActive, payload.expiresAt]
        );
        pollId = pollInsert.rows[0]?.id;
        if (!pollId) throw new Error('Failed to determine new poll id.');
      } else {
        // UPDATE EXISTING POLL
        await client.query(
          `UPDATE polls
             SET title = $1,
                 description = $2,
                 is_active = $3,
                 expires_at = $4
           WHERE id = $5`,
          [payload.title, payload.description, payload.isActive, payload.expiresAt, pollId]
        );

        // Replace options by deleting old ones
        await client.query(`DELETE FROM poll_options WHERE poll_id = $1`, [pollId]);
      }

      // INSERT OPTIONS
      const optionValues = payload.optionLabels.map((label, index) => `($1, $${index + 2})`).join(', ');
      await client.query({
        text: `INSERT INTO poll_options (poll_id, label) VALUES ${optionValues}`,
        values: [pollId, ...payload.optionLabels]
      });

      await client.query('COMMIT');

      const poll = await loadPollWithOptions(pollId);
      return res.status(201).json({ poll });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to create/update poll', error);
      return res.status(500).json({ message: 'Unable to create or update poll at this time.' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error while handling poll create/update', error);
    return res.status(500).json({ message: 'Unable to create or update poll at this time.' });
  }
});


// Vote on a poll (this wraps your top-level code into a proper async route)
router.post('/:pollId/vote', async (req, res) => {
  const userId = readJwtUserId(req);

  const pollId = toPositiveInt(req.params.pollId);
  if (!pollId) {
    return res.status(400).json({ message: 'A valid pollId must be provided.' });
  }

  const optionId = toPositiveInt(req.body?.optionId ?? req.body?.option_id);
  if (!optionId) {
    return res.status(400).json({ message: 'A valid optionId must be provided.' });
  }

  try {
    const poll = await loadPollWithOptions(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found.' });
    }

    const now = new Date();
    const expiresAt = parseExpiresAt(poll.expires_at);

    const isExpired = expiresAt && !Number.isNaN(expiresAt.valueOf()) && expiresAt <= now;
    if (!poll.is_active || isExpired) {
      return res.status(400).json({ message: 'This poll is no longer accepting votes.' });
    }

    const option = poll.options.find((item) => Number(item.id) === optionId);
    if (!option) {
      return res.status(400).json({ message: 'The selected option does not belong to this poll.' });
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO poll_votes (poll_id, option_id, user_id)
          VALUES ($1, $2, $3)
          ON CONFLICT ON CONSTRAINT poll_votes_unique_user_poll_idx
          DO UPDATE SET option_id = EXCLUDED.option_id`,
        [pollId, optionId, userId ?? null]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const refreshedPoll = await loadPollWithOptions(pollId);
    return res.json({ poll: refreshedPoll });
  } catch (error) {
    console.error('Failed to record poll vote', error);
    return res.status(500).json({ message: 'Unable to record vote at this time.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const pool = getPool();
    await pool.query('DELETE FROM polls WHERE id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete poll' });
  }
});



// // Alias /votes → /vote
// router.post('/:pollId/votes', async (req, res) => {
//   const voteHandler = router.stack.find(
//     layer => layer.route && layer.route.path === '/:pollId/vote'
//   )?.route.stack[0].handle;

//   if (!voteHandler) {
//     return res.status(500).json({ message: 'Vote handler not found.' });
//   }

//   try {
//     await voteHandler(req, res); // ✅ 用 await
//   } catch (err) {
//     console.error('Error in vote alias handler:', err);
//     if (!res.headersSent) {       // ✅ 確認還沒送 headers 才回 response
//       return res.status(500).json({ message: 'Unable to record vote at this time.' });
//     }
//   }
// });



module.exports = router;
