const express = require('express');

const { getPool } = require('../db');
const { readJwtUserId } = require('../utils/auth');
const { upsertCalendarItemForSource, deleteCalendarItemForSource } = require('../utils/calendarItems');

const router = express.Router();
const SOURCE_TYPE = 'competition';
const CATEGORY = 'Competition';

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toIntOrNull = (value) => {
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
};

const mapCompetitionRow = (row) => ({
  id: toIntOrNull(row.id) ?? row.id,
  title: row.title,
  description: row.description,
  location: row.location,
  reward: row.reward,
  start_time: row.start_time,
  end_time: row.end_time,
  is_cancelled: Boolean(row.is_cancelled),
  max_participants: toIntOrNull(row.max_participants),
  registrations_count: toIntOrNull(row.registrations_count) ?? 0
});

const competitionHasCapacity = (competition) => {
  if (!competition?.max_participants || competition.max_participants <= 0) {
    return true;
  }
  return competition.registrations_count < competition.max_participants;
};

const competitionHasPassed = (competition) => {
  if (!competition) return false;
  const reference = competition.end_time ? new Date(competition.end_time) : new Date(competition.start_time);
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

const findCompetitionById = async (competitionId) => {
  const { rows } = await getPool().query(
    `SELECT c.id,
            c.title,
            c.description,
            c.location,
            c.reward,
            c.start_time,
            c.end_time,
            c.is_cancelled,
            c.max_participants,
            (
              SELECT COUNT(*)::INT
                FROM competition_registrations r
               WHERE r.competition_id = c.id
            ) AS registrations_count
       FROM competitions c
      WHERE c.id = $1`,
    [competitionId]
  );
  return rows[0] ? mapCompetitionRow(rows[0]) : null;
};

const cleanupRegistrationForPastCompetition = async ({ competitionId, userId }) => {
  await deleteCalendarItemForSource({
    userId,
    sourceType: SOURCE_TYPE,
    sourceId: competitionId
  });

  await getPool().query(
    `DELETE FROM competition_registrations
       WHERE competition_id = $1 AND user_id = $2`,
    [competitionId, userId]
  );
};

const handleCompetitionJoin = async (req, res) => {
  const competitionId = parseId(req.params.competitionId);
  if (!competitionId) {
    return res.status(400).json({ message: 'A valid competition ID is required.' });
  }

  try {
    const competition = await findCompetitionById(competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found.' });
    }
    if (competition.is_cancelled) {
      return res.status(409).json({ message: 'This competition has been cancelled.' });
    }

    if (competitionHasPassed(competition)) {
      await cleanupRegistrationForPastCompetition({ competitionId, userId: req.userId });
      return res.status(409).json({ message: 'This competition has already ended.' });
    }

    if (!competitionHasCapacity(competition)) {
      return res.status(409).json({ message: 'This competition has reached capacity.' });
    }

    const calendarItem = await upsertCalendarItemForSource({
      userId: req.userId,
      sourceType: SOURCE_TYPE,
      sourceId: competition.id,
      title: competition.title,
      description: competition.description ?? null,
      startTime: competition.start_time,
      category: 'CATEGORY'
    });

    const registrationResult = await getPool().query(
      `INSERT INTO competition_registrations (competition_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (competition_id, user_id)
         DO UPDATE SET updated_at = NOW()
         RETURNING id, competition_id, user_id, created_at, updated_at`,
      [competitionId, req.userId]
    );

    return res.json({
      registration: registrationResult.rows[0],
      calendarItem
    });
  } catch (error) {
    console.error('Failed to register for competition', error);
    return res.status(500).json({ message: 'Unable to register for this competition right now.' });
  }
};

const handleCompetitionLeave = async (req, res) => {
  const competitionId = parseId(req.params.competitionId);
  if (!competitionId) {
    return res.status(400).json({ message: 'A valid competition ID is required.' });
  }

  try {
    const deleteResult = await getPool().query(
      `DELETE FROM competition_registrations
         WHERE competition_id = $1 AND user_id = $2
         RETURNING id`,
      [competitionId, req.userId]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: 'You are not registered for this competition.' });
    }

    await deleteCalendarItemForSource({
      userId: req.userId,
      sourceType: SOURCE_TYPE,
      sourceId: competitionId
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to unregister from competition', error);
    return res.status(500).json({ message: 'Unable to update your competition registration right now.' });
  }
};

router.post('/:competitionId/register', handleCompetitionJoin);
router.post('/:competitionId/join', handleCompetitionJoin);

router.delete('/:competitionId/register', handleCompetitionLeave);
router.delete('/:competitionId/join', handleCompetitionLeave);

module.exports = router;