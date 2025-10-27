const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const consentRoutes = require('./routes/consent');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

app.set('trust proxy', true);
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/dashboard', dashboardRoutes); 

module.exports = app;
