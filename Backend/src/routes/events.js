const express = require("express");
const multer = require("multer");
const { getPool } = require('../db');
const { embedContent } = require('../services/aiHub'); // 🟢 Added import
const { refreshAllUserCaches } = require('../services/cacheRefresher');

const router = express.Router();

// Multer: store file in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Ensure events table exists
async function ensureTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      date DATE NOT NULL,
      venue TEXT NOT NULL,
      description TEXT NOT NULL,
      poster BYTEA,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

/* ============================================
   GET /api/events
=============================================== */
router.get("/", async (req, res) => {
  const pool = getPool();
  try {
    await ensureTable();
    const result = await pool.query("SELECT * FROM events ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

/* ============================================
   POST /api/events (Create/Update)
=============================================== */
router.post("/", upload.single("poster"), async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureTable();

    let data = {};

    // Parse JSON in form-data "data"
    if (req.body.data) {
      try {
        data = JSON.parse(req.body.data);
      } catch (err) {
        console.error("❌ Invalid JSON in 'data':", req.body.data);
        return res.status(400).json({ error: "Invalid JSON in 'data'" });
      }
    }

    const { type, title, date, venue, description, id } = data;

    // Validate required fields
    if (!type || !title || !date || !venue || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Convert date string to Date object
    const dateValue = new Date(date);
    if (isNaN(dateValue.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Poster buffer (if uploaded)
    const posterBuffer = req.file ? req.file.buffer : null;

    await client.query("BEGIN");

    let eventId;

    if (id) {
      // UPDATE event
      const result = await client.query(
        `UPDATE events
         SET type=$1, title=$2, date=$3, venue=$4, description=$5,
             poster = COALESCE($6, poster)
         WHERE id=$7
         RETURNING id`,
        [type, title, dateValue, venue, description, posterBuffer, id]
      );
      eventId = result.rows[0].id;
    } else {
      // CREATE event
      const result = await client.query(
        `INSERT INTO events (type, title, date, venue, description, poster)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [type, title, dateValue, venue, description, posterBuffer]
      );
      eventId = result.rows[0].id;
    }

    await client.query("COMMIT");

    JavaScript

    // ✅ FIX: Trigger Embedding AND Cache Refresh
    const textToEmbed = `${type} ${title} ${description}`;
    embedContent({
      type: 'event',
      id: eventId,
      text: textToEmbed
    }).then(() => {
        // 🟢 NEW: Once embedded, update everyone's feed in the background
        console.log("Triggering background cache refresh for new event...");
        refreshAllUserCaches(); 
    }).catch(err => console.error(`Failed to embed event ${eventId}:`, err.message));

    res.json({
      success: true,
      id: eventId,
      message: id ? "Updated event" : "Created event"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in POST /events:", err);
    res.status(500).json({ error: "Failed to create/update event" });
  } finally {
    client.release();
  }
});

/* ============================================
   DELETE /api/events/:id
=============================================== */
router.delete("/:id", async (req, res) => {
  const pool = getPool();
  const id = parseInt(req.params.id);

  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    await pool.query("DELETE FROM events WHERE id=$1", [id]);
    
    // 🟢 NEW: Remove this event from everyone's recommendations
    refreshAllUserCaches(); 

    res.json({ success: true, message: `Deleted event ${id}` });
  } catch (err) {
    console.error("❌ Error deleting event:", err);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

module.exports = router;