const { Pool } = require('pg');
const { createPoolConfig } = require('../config/pool');

const poolConfig = createPoolConfig();
let pool = new Pool(poolConfig);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getPool = () => pool;

const createDatabaseIfMissing = async () => {
  if (process.env.DATABASE_URL) {
    throw new Error('Automatic database creation is not supported when using DATABASE_URL.');
  }

  const targetDb = poolConfig.database;
  if (!targetDb) {
    throw new Error('PGDATABASE must be specified when DATABASE_URL is not set.');
  }

  const adminDatabase = process.env.PGROOT_DB || 'postgres';
  const adminPool = new Pool({ ...poolConfig, database: adminDatabase });

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(targetDb)}`);
    console.info(`Created missing database "${targetDb}" using admin database "${adminDatabase}".`);
  } catch (error) {
    if (error.code === '42P04') {
      console.info(`Database "${targetDb}" already exists. Continuing.`);
      return;
    }
    throw error;
  } finally {
    await adminPool.end();
  }
};

const ensureDatabase = async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          role TEXT NOT NULL,
          first_name TEXT,
          last_name TEXT,
          email TEXT NOT NULL UNIQUE,
          student_id TEXT,
          phone TEXT,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
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