const { getPool } = require('../db');

const normalizeTimestamp = (value) => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
};

const extractDateParts = (timestamp) => {
  const iso = normalizeTimestamp(timestamp);
  if (!iso) {
    return null;
  }
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
  };
};

async function upsertCalendarItemForSource({
  userId,
  sourceType,
  sourceId,
  title,
  description = null,
  startTime,
  category
}) {
  if (!userId || !sourceType || sourceId == null) {
    throw new Error('Missing required fields for calendar sync.');
  }

  const dateParts = extractDateParts(startTime);
  if (!dateParts) {
    throw new Error('A valid start time is required to mirror this item into the calendar.');
  }

  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO user_calendar_items (
       user_id,
       source_type,
       source_id,
       title,
       description,
       date,
       time,
       category
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, source_type, source_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       date = EXCLUDED.date,
       time = EXCLUDED.time,
       category = EXCLUDED.category,
       updated_at = NOW()
     RETURNING id, user_id, source_type, source_id, title, description, date, time, category,
               created_at, updated_at`,
    [
      userId,
      sourceType,
      sourceId,
      title,
      description,
      dateParts.date,
      dateParts.time,
      category || sourceType
    ]
  );

  return result.rows[0];
}

async function deleteCalendarItemForSource({ userId, sourceType, sourceId }) {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM user_calendar_items
       WHERE user_id = $1 AND source_type = $2 AND source_id = $3`,
    [userId, sourceType, sourceId]
  );
  return result.rowCount > 0;
}

module.exports = {
  upsertCalendarItemForSource,
  deleteCalendarItemForSource
};