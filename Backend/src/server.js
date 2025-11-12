const { PORT } = require('./config/env');
const app = require('./app');
const { ensureDatabase } = require('./db');

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Authentication server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize the database schema', error);
    process.exit(1);
  });