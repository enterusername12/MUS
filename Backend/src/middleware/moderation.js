// Calls the FastAPI moderation service for a post description
const axios = require('axios');

// 🟢 FIX: Default to 8020 to match your Python command
const AI_MOD_URL = process.env.AI_MOD_URL || 'http://localhost:8020/moderate';

async function aiModeration(req, _res, next) {
  try {
    const { description } = req.body || {};
    if (!description || typeof description !== 'string') {
      req.moderation = { action: 'publish', toxic_prob: 0 };
      return next();
    }

    const { data } = await axios.post(AI_MOD_URL, {
      text: description,
      meta: { source: 'community_post' }
    }, { timeout: 12_000 });

    req.moderation = data || { action: 'publish', toxic_prob: 0 };
    return next();
  } catch (err) {
    console.error('[AI moderation] error:', err.message);
    // Mark as unreachable so you know why it failed
    req.moderation = { action: 'publish', toxic_prob: 0, error: 'ai_unreachable', reason: err.message };
    return next();
  }
}

module.exports = aiModeration;