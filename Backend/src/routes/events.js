const express = require('express');

const { getPool } = require('../db');
const { readJwtUserId } = require('../utils/auth');
const { upsertCalendarItemForSource, deleteCalendarItemForSource } = require('../utils/calendarItems');

const router = express.Router();
const SOURCE_TYPE = 'event';
const CATEGORY = 'Campus Event';

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toIntOrNull = (value) => {
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
};

const mapEventRow = (row) => ({
  id: toIntOrNull(row.id) ?? row.id,
  title: row.title,
  description: row.description,
  location: row.location,
  start_time: row.start_time,
  end_time: row.end_time,
  is_cancelled: Boolean(row.is_cancelled),
  max_participants: toIntOrNull(row.max_participants),
  registrations_count: toIntOrNull(row.registrations_count) ?? 0
});

const eventHasCapacity = (event) => {
  if (!event?.max_participants || event.max_participants <= 0) {
    return true;
  }
  return event.registrations_count < event.max_participants;
};

const eventHasPassed = (event) => {
  if (!event) return false;
  const reference = event.end_time ? new Date(event.end_time) : new Date(event.start_time);
  if (Number.isNaN(reference.valueOf())) {
    return false;
  }
  return reference.getTime() <= Date.now();
};

router.use((req, res, next) => {
  const userId = readJwtUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  req.userId = userId;
  return next();
});

const findEventById = async (eventId) => {
  const { rows } = await getPool().query(
    `SELECT e.id,
            e.title,
            e.description,
            e.location,
            e.start_time,
            e.end_time,
            e.is_cancelled,
            e.max_participants,
            (
              SELECT COUNT(*)::INT
                FROM event_registrations r
               WHERE r.event_id = e.id
            ) AS registrations_count
       FROM campus_events e
      WHERE e.id = $1`,
    [eventId]
  );
  return rows[0] ? mapEventRow(rows[0]) : null;
};

const cleanupRegistrationForPastEvent = async ({ eventId, userId }) => {
  await deleteCalendarItemForSource({
    userId,
    sourceType: SOURCE_TYPE,
    sourceId: eventId
  });

  await getPool().query(
    `DELETE FROM event_registrations
       WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
};

const handleEventJoin = async (req, res) => {
  const eventId = parseId(req.params.eventId);
  if (!eventId) {
    return res.status(400).json({ message: 'A valid event ID is required.' });
  }

  try {
    const event = await findEventById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (event.is_cancelled) {
      return res.status(409).json({ message: 'This event has been cancelled.' });
    }

    if (eventHasPassed(event)) {
      await cleanupRegistrationForPastEvent({ eventId, userId: req.userId });
      return res.status(409).json({ message: 'This event has already ended.' });
    }

    if (!eventHasCapacity(event)) {
      return res.status(409).json({ message: 'This event has reached capacity.' });
    }

    const calendarItem = await upsertCalendarItemForSource({
      userId: req.userId,
      sourceType: SOURCE_TYPE,
      sourceId: event.id,
      title: event.title,
      description: event.description ?? null,
      startTime: event.start_time,
      category: 'CATEGORY'
    });

    const registrationResult = await getPool().query(
      `INSERT INTO event_registrations (event_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (event_id, user_id)
         DO UPDATE SET updated_at = NOW()
         RETURNING id, event_id, user_id, created_at, updated_at`,
      [eventId, req.userId]
    );

    return res.json({
      registration: registrationResult.rows[0],
      calendarItem
    });
  } catch (error) {
    console.error('Failed to register for event', error);
    return res.status(500).json({ message: 'Unable to register for this event right now.' });
  }
};

const handleEventLeave = async (req, res) => {
  const eventId = parseId(req.params.eventId);
  if (!eventId) {
    return res.status(400).json({ message: 'A valid event ID is required.' });
  }

  try {
    const deleteResult = await getPool().query(
      `DELETE FROM event_registrations
         WHERE event_id = $1 AND user_id = $2
         RETURNING id`,
      [eventId, req.userId]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: 'You are not registered for this event.' });
    }

    await deleteCalendarItemForSource({
      userId: req.userId,
      sourceType: SOURCE_TYPE,
      sourceId: eventId
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to unregister from event', error);
    return res.status(500).json({ message: 'Unable to update your registration right now.' });
  }
};

router.post('/:eventId/register', handleEventJoin);
router.post('/:eventId/join', handleEventJoin);

router.delete('/:eventId/register', handleEventLeave);
router.delete('/:eventId/join', handleEventLeave);

module.exports = router;