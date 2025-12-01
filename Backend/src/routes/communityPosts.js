const express = require('express');
const { getPool } = require('../db');
const aiModeration = require('../middleware/moderation');
// Import AI services
const { embedContent, getDashboardRecommendations } = require('../services/aiHub');
const { readUserIdFromRequest } = require('../utils/auth');

const router = express.Router();

const normalizeTags = (rawTags) => {
  if (Array.isArray(rawTags)) {
    return rawTags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  }
  if (typeof rawTags === 'string') {
    return rawTags.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
};

// Helper to refresh cache for active users
async function refreshSuggestionsForActiveUsers() {
  const pool = getPool();
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM users WHERE updated_at > NOW() - INTERVAL '30 days'`
    );
    console.log(`[Moderation] Pre-calculating recommendations for ${users.length} active users...`);
    users.forEach(user => {
      getDashboardRecommendations({ 
        userId: user.id,
        kHeadline: 12, 
        kPosts: 6, 
        kPolls: 6, 
        useCache: false 
      }).catch(err => console.warn(`[Background Reco] Failed for user ${user.id}:`, err.message));
    });
  } catch (err) {
    console.error("[Moderation] Failed to trigger background cache update:", err);
  }
}

// 1. CREATE POST
router.post('/', aiModeration, async (req, res) => {
  const { title, description, category, tags } = req.body || {};
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  const normalizedCategory = typeof category === 'string' && category.trim() ? category.trim() : 'General';
  const normalizedTags = normalizeTags(tags);
  const userId = readUserIdFromRequest(req);

  if (!normalizedTitle || !normalizedDescription) {
    return res.status(400).json({ message: 'Title and description are required.' });
  }

  const { action = 'publish', toxic_prob = 0, reason = null, ...meta } = req.moderation || {};
  const moderation_status = action; 
  const moderation_score = Number(toxic_prob) || 0;
  const moderation_meta = { reason, ...meta };

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO community_posts (title, category, description, tags, moderation_status, moderation_score, moderation_meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at, moderation_status, moderation_score`,
      [normalizedTitle, normalizedCategory, normalizedDescription, normalizedTags.length > 0 ? normalizedTags : null, moderation_status, moderation_score, moderation_meta]
    );

    const created = result.rows[0];
    
    // If published immediately, embed it
    if (moderation_status === 'publish') {
      // ✅ FIX: Embed Title + Category + Description
      embedContent({
        type: 'post',
        id: created.id,
        text: `${normalizedTitle} ${normalizedCategory} ${normalizedDescription}`
      });
      if (userId) {
         getDashboardRecommendations({ userId, useCache: false }).catch(() => {});
      }
    }

    return res.status(201).json({
      message: moderation_status === 'publish' ? 'Post shared successfully!' : 'Post queued for review.',
      post: {
        id: created?.id,
        title: normalizedTitle,
        category: normalizedCategory,
        description: normalizedDescription,
        moderation: { status: created?.moderation_status, score: created?.moderation_score }
      }
    });
  } catch (error) {
    console.error('Failed to create community post:', error);
    return res.status(500).json({ message: 'Unable to share post.' });
  } finally {
    client.release();
  }
});

// 2. GET POSTS (For Moderation Queue)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const pool = getPool();
  try {
    let query = `SELECT id, title, category, description, moderation_status, moderation_score, created_at FROM community_posts`;
    const params = [];
    
    if (status) {
      query += ` WHERE moderation_status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 100`;
    const { rows } = await pool.query(query, params);
    return res.json({ posts: rows });
  } catch (err) {
    console.error('List posts failed:', err);
    return res.status(500).json({ message: 'Unable to load posts.' });
  }
});

// 3. APPROVE POST (Embed + Cache Update)
router.patch('/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  const pool = getPool();
  try {
    // ✅ FIX: Fetch 'category' in RETURNING clause to use for embedding
    const result = await pool.query(
      `UPDATE community_posts 
       SET moderation_status = 'publish', updated_at = NOW() 
       WHERE id = $1 
       RETURNING id, title, description, category`,
      [id]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    const post = result.rows[0];

    // ✅ FIX: Embed Title + Category + Description
    const textToEmbed = `${post.title} ${post.category || ''} ${post.description}`;
    
    embedContent({
        type: 'post',
        id: post.id,
        text: textToEmbed
    }).then(() => refreshSuggestionsForActiveUsers());

    return res.json({ message: 'Post approved and processing started.' });
  } catch (err) {
    console.error('Approve post failed:', err);
    return res.status(500).json({ message: 'Unable to approve post.' });
  }
});

// 4. BLOCK POST
router.patch('/:id/block', async (req, res) => {
  const id = Number(req.params.id);
  const pool = getPool();
  try {
    const result = await pool.query(
      `UPDATE community_posts SET moderation_status = 'block', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ message: 'Post blocked.' });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to block post.' });
  }
});

module.exports = router;