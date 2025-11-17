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

module.exports = router;
