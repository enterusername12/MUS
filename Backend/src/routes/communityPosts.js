const express = require('express');

const { getPool } = require('../db');

const router = express.Router();

const normalizeTags = (rawTags) => {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);
  }

  if (typeof rawTags === 'string') {
    return rawTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

router.post('/', async (req, res) => {
  const { title, description, category, tags } = req.body || {};

  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  const normalizedCategory = typeof category === 'string' && category.trim() ? category.trim() : 'General';
  const normalizedTags = normalizeTags(tags);

  if (!normalizedTitle || !normalizedDescription) {
    res.status(400).json({ message: 'Title and description are required.' });
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      {
        text: `INSERT INTO community_posts (title, category, description, tags)
               VALUES ($1, $2, $3, $4)
               RETURNING id, created_at`,
        values: [normalizedTitle, normalizedCategory, normalizedDescription, normalizedTags.length > 0 ? normalizedTags : null]
      }
    );

    const createdPost = result.rows[0];
    res.status(201).json({
      message: 'Post shared successfully!',
      post: {
        id: createdPost?.id,
        title: normalizedTitle,
        category: normalizedCategory,
        description: normalizedDescription,
        tags: normalizedTags,
        createdAt: createdPost?.created_at
      }
    });
  } catch (error) {
    console.error('Failed to create community post:', error);
    res.status(500).json({ message: 'Unable to share post at this time.' });
  } finally {
    client.release();
  }
});

module.exports = router;
