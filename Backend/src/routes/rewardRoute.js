// rewardRoute.js
const express = require("express");
const router = express.Router();
const { getPool } = require('../db');

// POST /api/reward/claim
router.post("/claim", async (req, res) => {
  try {
    const { userId, token, points } = req.body;

    if (!userId || !token || !points) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    console.log("Reward claim request:", userId, token, points);

    const updateQuery = `
      INSERT INTO reward_points (user_id, points, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET points = reward_points.points + $2, updated_at = NOW()
      RETURNING *;
    `;

    // 使用 getPool() 直接查询，并解构 rows
    const { rows: updatedRows } = await getPool().query(updateQuery, [userId, points]);

    res.json({ success: true, data: updatedRows[0] });
  } catch (err) {
    console.error("Reward claim error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
