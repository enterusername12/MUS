// src/routes/reco.js
const express = require('express');
const {
  logInteraction,
  getVisitorDashboardRecommendations,
} = require("../services/aiHub");

const router = express.Router();

router.post('/interact', async (req, res) => {
  try {
    const { user_id, event_id, action, timestamp } = req.body || {};
    if (!user_id || !event_id || !action) {
      return res.status(400).json({ error: 'user_id, event_id, action are required' });
    }
    const out = await logInteraction({ userId: user_id, eventId: event_id, action, timestamp });
    res.json(out);
  } catch (err) {
    console.error('AI interact error:', err.message);
    res.json({ status: 'logged-local' });
  }
});

// Visitor dashboard recommendations (no account, no DB writes)
router.post("/visitor-dashboard", async (req, res) => {
  try {
    const { interestsText, kHeadline, kPosts, kPolls } = req.body || {};

    if (!interestsText || typeof interestsText !== "string") {
      return res
        .status(400)
        .json({ error: "interestsText (string) is required" });
    }

    const data = await getVisitorDashboardRecommendations({
      interestsText: interestsText.trim(),
      kHeadline: kHeadline || 12,
      kPosts: kPosts || 6,
      kPolls: kPolls || 6,
    });

    return res.json(data || { headline: [], posts: [], polls: [] });
  } catch (err) {
    console.error("Error in POST /api/reco/visitor-dashboard:", err);
    return res.status(500).json({ error: "failed_to_recommend" });
  }
});


module.exports = router;
