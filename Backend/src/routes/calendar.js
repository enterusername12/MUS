const express = require('express');

const { getPool } = require('../db');
const { readJwtUserId } = require('../utils/auth');

const router = express.Router();

const PERSONAL_SOURCE_TYPE = 'user-manual';
const MAX_LIMIT = 100;

const parsePositiveInt = (value, fallback = null) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseLimit = (value, fallback = 25) => {
  const parsed = parsePositiveInt(value, fallback);
  if (!parsed) {
    return fallback;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const sanitizeDate = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
};

const sanitizeTime = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
};

const sanitizeText = (value, fallback = null) => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, 255);
};

const generateManualSourceId = () => {
  const random = Math.floor(Math.random() * 1_000_000_000);
  return random > 0 ? random : 1;
};

const respondUnauthorized = (res) => {
  res.status(401).json({ message: 'Authentication required.' });
};

const respondNotFound = (res) => {
  res.status(404).json({ message: 'Calendar item not found.' });
};

router.use((req, res, next) => {
  const userId = readJwtUserId(req);
  if (!userId) {
    return respondUnauthorized(res);
  }
  req.userId = userId;
  return next();
});

router.get('/', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const result = await getPool().query(
      `SELECT id, user_id, source_type, source_id, title, date, time, category,
              created_at, updated_at
         FROM user_calendar_items
        WHERE user_id = $1
        ORDER BY date ASC NULLS LAST, time ASC NULLS LAST, id ASC
        LIMIT $2`,
      [req.userId, limit]
    );

    res.json({ items: result.rows });
  } catch (error) {
    console.error('Failed to load user calendar items', error);
    res.status(500).json({ message: 'Unable to load calendar items.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = sanitizeText(req.body?.title);
    const date = sanitizeDate(req.body?.date);
    const time = sanitizeTime(req.body?.time);
    const category = sanitizeText(req.body?.category, 'Personal');

    if (!title) {
      return res.status(400).json({ message: 'Title is required.' });
    }
    if (!date) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required.' });
    }

    const sourceId = generateManualSourceId();

    const result = await getPool().query(
      `INSERT INTO user_calendar_items (
         user_id,
         source_type,
         source_id,
         title,
         date,
         time,
         category
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, source_type, source_id, title, date, time, category,
                 created_at, updated_at`,
      [req.userId, PERSONAL_SOURCE_TYPE, sourceId, title, date, time, category]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    console.error('Failed to create user calendar item', error);
    res.status(500).json({ message: 'Unable to save calendar item.' });
  }
});

router.put('/:id', async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(400).json({ message: 'A valid calendar item ID is required.' });
  }

  const updates = [];
  const values = [];

  const title = sanitizeText(req.body?.title);
  const date = sanitizeDate(req.body?.date);
  const time = req.body?.time === '' ? null : sanitizeTime(req.body?.time);
  const category = sanitizeText(req.body?.category);

  if (title) {
    updates.push(`title = $${values.length + 1}`);
    values.push(title);
  }
  if (date) {
    updates.push(`date = $${values.length + 1}`);
    values.push(date);
  }
  if (req.body?.time === '' || req.body?.time === null) {
    updates.push('time = NULL');
  } else if (time) {
    updates.push(`time = $${values.length + 1}`);
    values.push(time);
  }
  if (req.body?.category === '' || req.body?.category === null) {
    updates.push('category = NULL');
  } else if (category) {
    updates.push(`category = $${values.length + 1}`);
    values.push(category);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'Provide at least one field to update.' });
  }

  updates.push('updated_at = NOW()');

  const itemIdParamIndex = values.length + 1;
  const userIdParamIndex = values.length + 2;
  values.push(itemId, req.userId);

  try {
    const result = await getPool().query(
      `UPDATE user_calendar_items
          SET ${updates.join(', ')}
        WHERE id = $${itemIdParamIndex} AND user_id = $${userIdParamIndex}
        RETURNING id, user_id, source_type, source_id, title, date, time, category,
                  created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      return respondNotFound(res);
    }

    return res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Failed to update calendar item', error);
    return res.status(500).json({ message: 'Unable to update calendar item.' });
  }
});

router.delete('/:id', async (req, res) => {
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    return res.status(400).json({ message: 'A valid calendar item ID is required.' });
  }

  try {
    const result = await getPool().query(
      `DELETE FROM user_calendar_items
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [itemId, req.userId]
    );

    if (result.rowCount === 0) {
      return respondNotFound(res);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete calendar item', error);
    return res.status(500).json({ message: 'Unable to delete calendar item.' });
  }
});

module.exports = router;