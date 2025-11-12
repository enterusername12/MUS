const express = require('express');
const { getPool } = require('../db');
const aiModeration = require('../middleware/moderation');

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

// POST /api/community-posts  (Create post → AI moderation → save)
router.post('/', aiModeration, async (req, res) => {
  const { title, description, category, tags } = req.body || {};
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  const normalizedCategory = typeof category === 'string' && category.trim() ? category.trim() : 'General';
  const normalizedTags = normalizeTags(tags);

  if (!normalizedTitle || !normalizedDescription) {
    return res.status(400).json({ message: 'Title and description are required.' });
  }

  // Map AI decision to DB status
  const { action = 'publish', toxic_prob = 0, reason = null, ...meta } = req.moderation || {};
  const moderation_status = action; // publish | queue | block
  const moderation_score = Number(toxic_prob) || 0;
  const moderation_meta = { reason, ...meta };

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      {
        text: `INSERT INTO community_posts
                 (title, category, description, tags, moderation_status, moderation_score, moderation_meta)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, created_at, moderation_status, moderation_score`,
        values: [
          normalizedTitle,
          normalizedCategory,
          normalizedDescription,
          normalizedTags.length > 0 ? normalizedTags : null,
          moderation_status,
          moderation_score,
          moderation_meta
        ]
      }
    );

    const created = result.rows[0];
    const message =
      moderation_status === 'block'
        ? 'Post blocked by AI moderation.'
        : moderation_status === 'queue'
          ? 'Post submitted and queued for review.'
          : 'Post shared successfully!';

    return res.status(201).json({
      message,
      post: {
        id: created?.id,
        title: normalizedTitle,
        category: normalizedCategory,
        description: normalizedDescription,
        tags: normalizedTags,
        createdAt: created?.created_at,
        moderation: {
          status: created?.moderation_status,
          score: created?.moderation_score
        }
      }
    });
  } catch (error) {
    console.error('Failed to create community post:', error);
    return res.status(500).json({ message: 'Unable to share post at this time.' });
  } finally {
    client.release();
  }
});

// GET /api/community-posts?status=queue|block|publish  (list for dashboards)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const pool = getPool();
  const client = await pool.connect();
  try {
    const params = [];
    let where = '';
    if (status && typeof status === 'string') {
      params.push(status.trim());
      where = 'WHERE moderation_status = $1';
    }

    const result = await client.query(
      `SELECT id, title, category, description, tags, moderation_status, moderation_score, created_at
         FROM community_posts
         ${where}
         ORDER BY created_at DESC
         LIMIT 100`,
      params
    );

    return res.json({ posts: result.rows });
  } catch (err) {
    console.error('List community posts failed:', err);
    return res.status(500).json({ message: 'Unable to load posts.' });
  } finally {
    client.release();
  }
});

// PATCH /api/community-posts/:id/approve  (staff approves queued/blocked post)
router.patch('/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE community_posts
         SET moderation_status = 'publish', updated_at = NOW()
       WHERE id = $1
       RETURNING id, moderation_status`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ message: 'Post approved', post: result.rows[0] });
  } catch (err) {
    console.error('Approve post failed:', err);
    return res.status(500).json({ message: 'Unable to approve post.' });
  } finally {
    client.release();
  }
});

// PATCH /api/community-posts/:id/block  (staff blocks post)
router.patch('/:id/block', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE community_posts
         SET moderation_status = 'block', updated_at = NOW()
       WHERE id = $1
       RETURNING id, moderation_status`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ message: 'Post blocked', post: result.rows[0] });
  } catch (err) {
    console.error('Block post failed:', err);
    return res.status(500).json({ message: 'Unable to block post.' });
  } finally {
    client.release();
  }
});

module.exports = router;
