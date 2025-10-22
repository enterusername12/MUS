const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');

const app = express();

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

module.exports = app;