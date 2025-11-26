const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

const pool = getPool();

/* ============================================================
   1. POLLS ANALYSIS - FIXED TO MATCH YOUR DATABASE SCHEMA
   ============================================================ */
router.get('/polls', async (req, res) => {
  try {
    const pollsQuery = `
      SELECT 
        p.id,
        p.title,
        p.description,
        p.is_active AS "isActive",
        p.expires_at AS "expiresAt",
        p.created_at AS "createdAt",
        COUNT(DISTINCT pv.id) AS "totalVotes"
      FROM polls p
      LEFT JOIN poll_votes pv ON p.id = pv.poll_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const pollsResult = await pool.query(pollsQuery);

    const pollsWithOptions = await Promise.all(
      pollsResult.rows.map(async (poll) => {
        const optionsQuery = `
          SELECT 
            po.id,
            po.label AS "label",
            COUNT(pv.id) AS votes
          FROM poll_options po
          LEFT JOIN poll_votes pv ON po.id = pv.option_id
          WHERE po.poll_id = $1
          GROUP BY po.id, po.label
          ORDER BY po.id
        `;

        const optionsResult = await pool.query(optionsQuery, [poll.id]);

        const totalVotes = parseInt(poll.totalVotes) || 0;

        const colors = ['#c2577e', '#5a2154', '#a04573', '#dc92ac', '#8b3a62', '#6d2c5a'];

        const options = optionsResult.rows.map((o, i) => ({
          id: o.id,
          name: o.label,
          votes: parseInt(o.votes) || 0,
          percentage: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0,
          color: colors[i % colors.length]
        }));

        // Count total students
        const totalStudentsQuery = `SELECT COUNT(*) FROM users WHERE role = 'Student'`;
        const totalStudents = parseInt((await pool.query(totalStudentsQuery)).rows[0].count);

        const participation = totalStudents > 0
          ? Math.round((totalVotes / totalStudents) * 100)
          : 0;

        const now = new Date();
        const expiresAt = new Date(poll.expiresAt);
        const status = poll.isActive && expiresAt > now ? 'active' : 'completed';

        return {
          id: poll.id,
          title: poll.title,
          description: poll.description,
          status,
          endDate: expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          totalVotes,
          participation,
          options
        };
      })
    );

    res.json(pollsWithOptions);
  } catch (err) {
    console.error('Error loading poll analysis:', err);
    res.status(500).json({ error: 'Failed to fetch poll analysis' });
  }
});

/* ============================================================
   2. STUDENTS ANALYSIS – MATCHES reward_points + users
   ============================================================ */
router.get('/students', async (req, res) => {
  try {
    const q = `
      SELECT 
        u.id,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.student_id AS "studentId",
        rp.points,
        rp.updated_at AS "lastUpdated"
      FROM reward_points rp
      JOIN users u ON rp.user_id = u.id
      WHERE u.role = 'Student'
      ORDER BY rp.points DESC
      LIMIT 10
    `;

    const studentsResult = await pool.query(q);

    if (!studentsResult.rows) {
      return res.json([]); // avoid crash
    }

    const data = studentsResult.rows.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      studentId: s.studentId,
      totalPoints: s.points,
      lastUpdated: s.lastUpdated
    }));

    res.json(data);
  } catch (err) {
    console.error('Error loading students:', err);
    res.status(500).json({ error: 'Failed to fetch students analysis' });
  }
});

/* ============================================================
   3. STATS SUMMARY
   ============================================================ */
router.get('/stats', async (req, res) => {
  try {
    const activePolls = await pool.query(`
      SELECT COUNT(*) FROM polls 
      WHERE is_active = true AND expires_at > NOW()
    `);

    const votesToday = await pool.query(`
      SELECT COUNT(*) FROM poll_votes
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const totalStudents = await pool.query(`
      SELECT COUNT(*) FROM users WHERE role = 'Student'
    `);

    res.json({
      activePolls: parseInt(activePolls.rows[0].count),
      votesToday: parseInt(votesToday.rows[0].count),
      totalStudents: parseInt(totalStudents.rows[0].count),
    });
  } catch (err) {
    console.error('Error loading stats:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
