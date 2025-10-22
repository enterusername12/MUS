const { readEnv } = require('./env');

const resolveSslConfig = () => {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  if (mode) {
    if (mode === 'disable') {
      return false;
    }
    if (mode === 'verify-full') {
      return { rejectUnauthorized: true };
    }

    return { rejectUnauthorized: false };
  }

  if (process.env.DATABASE_URL) {
    return { rejectUnauthorized: false };
  }

  return undefined;
};

const createPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: resolveSslConfig()
    };
  }

  const password = process.env.PGPASSWORD;
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'mus_auth',
    ssl: resolveSslConfig(),
    ...(password ? { password } : {})
  };
};

const isPlaceholderHost = (host) => host.includes('example.com');

module.exports = {
  createPoolConfig,
  resolveSslConfig,
  isPlaceholderHost,
  readEnv
};