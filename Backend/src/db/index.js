const { Pool } = require('pg');
const { createPoolConfig } = require('../config/pool');

const poolConfig = createPoolConfig();
let pool = new Pool(poolConfig);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getPool = () => pool;

/* ... keep the rest of file exactly as-is up to creation of community_posts ... */

const seedDashboardData = async (client) => {
  /* unchanged – keep existing seedDashboardData implementation */
};

/* createDatabaseIfMissing & ensureDatabase definitions remain –
   Only the ensureDatabase() body below gets non-destructive ALTERs added. */

const createDatabaseIfMissing = async () => {
  /* unchanged */
};

const ensureDatabase = async () => {
  try {
    const client = await pool.connect();
    try {
      /* ... all existing CREATE TABLE statements ... */

      await client.query(
        `CREATE TABLE IF NOT EXISTS community_posts (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          category TEXT,
          description TEXT NOT NULL,
          tags TEXT[],
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      // NEW: add moderation columns (safe, idempotent)
      await client.query(
        `ALTER TABLE community_posts
           ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'publish',
           ADD COLUMN IF NOT EXISTS moderation_score DOUBLE PRECISION NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS moderation_meta JSONB`
      );

      await client.query(
        `CREATE INDEX IF NOT EXISTS community_posts_moderation_idx
           ON community_posts (moderation_status, created_at DESC)`
      );

      /* ... the rest of indices and seedDashboardData ... */

      await client.query(
        `CREATE INDEX IF NOT EXISTS community_posts_created_at_idx
           ON community_posts (created_at DESC)`
      );

      await client.query(
        `CREATE INDEX IF NOT EXISTS feedback_submissions_status_idx
           ON feedback_submissions (status, created_at DESC)`
      );

      await seedDashboardData(client);
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '3D000' && !process.env.DATABASE_URL) {
      console.warn(
        `Database "${poolConfig.database}" was not found. Attempting to create it via admin database "${process.env.PGROOT_DB || 'postgres'}"...`
      );
      await createDatabaseIfMissing();
      await pool.end().catch(() => {});
      pool = new Pool(poolConfig);
      await ensureDatabase();
      return;
    }

    if (error.code === '28P01') {
      console.error(
        'PostgreSQL rejected the supplied credentials. Verify PGUSER/PGPASSWORD or adjust local trust authentication settings.'
      );
    }

    throw error;
  }
};

module.exports = {
  getPool,
  ensureDatabase
};
