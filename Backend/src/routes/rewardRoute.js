// rewardRoute.js
const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL // or your local DB URL
});

// POST /api/reward/claim
router.post("/claim", async (req, res) => {
  try {
    const { userId, token, points } = req.body;

    if (!userId || !token || !points) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Update reward_points table
    const updateQuery = `
      INSERT INTO reward_points (user_id, points, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET points = reward_points.points + $2, updated_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(updateQuery, [userId, points]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Reward claim error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});
module.exports = router; // ✅ export the router directly