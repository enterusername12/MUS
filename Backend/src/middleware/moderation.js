// Calls the FastAPI moderation service for a post description
const axios = require('axios');

const AI_MOD_URL = process.env.AI_MOD_URL || 'http://localhost:8000/moderate';

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

    // Expected: { action: 'publish'|'queue'|'block', toxic_prob: 0..1, ... }
    req.moderation = data || { action: 'publish', toxic_prob: 0 };
    return next();
  } catch (err) {
    console.error('[AI moderation] error:', err.message);
    // Fail-open but mark unknown so staff can review later if needed
    req.moderation = { action: 'publish', toxic_prob: 0, error: 'ai_unreachable' };
    return next();
  }
}

module.exports = aiModeration;
