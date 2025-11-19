const express = require("express");
const multer = require("multer");
const { getPool } = require('../db');
const crypto = require("crypto");

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------- Ensure tables exist ----------
async function ensureTables() {
  const pool = getPool();

  // 1️⃣ Competition table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competition (
      id SERIAL PRIMARY KEY,
      hosts TEXT[],
      title TEXT,
      reward TEXT,
      venue TEXT,
      max_participants INT,
      due TIMESTAMP,
      description TEXT,
      banner BYTEA
    );
  `);

  // 2️⃣ Participation table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS participation (
      id SERIAL PRIMARY KEY,
      competition_id INT REFERENCES competition(id) ON DELETE CASCADE,
      Participants_token TEXT UNIQUE NOT NULL,
      participants INT DEFAULT 0,
      joined_at TIMESTAMP DEFAULT NOW()
    );
  `);
    // 4️⃣ Competition Registration table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competition_registrations (
      id SERIAL PRIMARY KEY,
      competition_id INT REFERENCES competition(id) ON DELETE CASCADE,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 3️⃣ Reward table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reward (
      id SERIAL PRIMARY KEY,
      competition_id INT REFERENCES competition(id) ON DELETE CASCADE,
      rewardToken TEXT NOT NULL,
      points INT DEFAULT 0,
      UNIQUE (competition_id, rewardToken)
    );
  `);
}

// ---------- POST /competition ----------
router.post("/", upload.single("banner"), async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureTables();

    let data = {};
    if (req.body.data) {
      try {
        data = JSON.parse(req.body.data);
      } catch (err) {
        console.error("❌ Failed to parse req.body.data:", req.body.data);
      }
    }

    const bannerBuffer = req.file ? req.file.buffer : null;
    let competitionId;

    await client.query("BEGIN");

    // ---------- INSERT / UPDATE Competition ----------
    if (data.id) {
      // UPDATE
      const result = await client.query(
        `
        UPDATE competition
        SET hosts=$1, title=$2, reward=$3, venue=$4,
            max_participants=$5, due=$6, description=$7,
            banner=COALESCE($8, banner)
        WHERE id=$9
        RETURNING id;
      `,
        [
          data.hosts || [],
          data.title || "",
          data.reward || "",
          data.venue || "",
          data.maxParticipants || 0,
          data.due || null,
          data.description || "",
          bannerBuffer,
          data.id,
        ]
      );
      competitionId = result.rows[0].id;
    } else {
      // INSERT
      const result = await client.query(
        `
        INSERT INTO competition
        (hosts, title, reward, venue, max_participants, due, description, banner)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id;
      `,
        [
          data.hosts || [],
          data.title || "",
          data.reward || "",
          data.venue || "",
          data.maxParticipants || 0,
          data.due || null,
          data.description || "",
          bannerBuffer,
        ]
      );
      competitionId = result.rows[0].id;
    }

    // ---------- Participation: generate participant QR token ----------
    const participantToken = crypto.randomBytes(16).toString("hex");

    await client.query(
      `
      INSERT INTO participation (competition_id, Participants_token, participants)
      VALUES ($1, $2, 0)
      ON CONFLICT (Participants_token) DO NOTHING;
    `,
      [competitionId, participantToken]
    );

    // ---------- Reward: generate reward QR token ----------
    const rewardToken = crypto.randomBytes(16).toString("hex");

    await client.query(
      `
      INSERT INTO reward (competition_id, rewardToken, points)
      VALUES ($1, $2, $3)
      ON CONFLICT (competition_id, rewardToken) DO NOTHING;
    `,
      [competitionId, rewardToken, data.reward]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      id: competitionId,
      participantToken,
      rewardToken,
      message: data.id ? "Updated competition" : "Created competition",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in POST /competition:", err);
    res.status(500).send("Failed to create/update competition");
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const pool = getPool();
    await pool.query('DELETE FROM competition WHERE id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete competition' });
  }
});

// ---------- POST /competition/register ----------
// Body expects: { userId, competitionId }
// ---------- POST /competition/register ----------
router.post("/register", async (req, res) => {
  const pool = getPool();
  const { userId, competitionId } = req.body;

  if (!userId || !competitionId) {
    return res.status(400).json({
      success: false,
      error: "Missing userId or competitionId"
    });
  }

  try {
    // 0️⃣ Check competition exists
    const compCheck = await pool.query(
      `SELECT id FROM competition WHERE id = $1`,
      [competitionId]
    );
    if (compCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Competition with id ${competitionId} does not exist`
      });
    }

    // 1️⃣ Check if the registration already exists
    const check = await pool.query(
      `SELECT id FROM competition_registrations WHERE user_id = $1 AND competition_id = $2`,
      [userId, competitionId]
    );


    if (check.rows.length > 0) {
      // Already exists → return existing id
      return res.json({
        success: true,
        message: "User already registered",
        registration: check.rows[0]
      });
    }

    // 2️⃣ Insert new registration → id auto-increments
    const result = await pool.query(
      `INSERT INTO competition_registrations (user_id, competition_id)
       VALUES ($1, $2)
       RETURNING *;`,
      [userId, competitionId]
    );


// 2️⃣ Insert new registration
const registration = await pool.query(
  `INSERT INTO competition_registrations (user_id, competition_id)
   VALUES ($1, $2)
   RETURNING *;`,
  [userId, competitionId]
);

// 3️⃣ Update participants count (+1)
await pool.query(
  `UPDATE participation
   SET participants = participants + 1
   WHERE competition_id = $1`,
  [competitionId]
);

    return res.json({
      success: true,
      registration: result.rows[0]
    });

  } catch (err) {
    console.error("❌ Error in POST /competition/register:", err);
    return res.status(500).json({ success: false, error: "Failed to register competition" });
  }
});



module.exports = router;
