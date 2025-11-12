const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const consentRoutes = require('./routes/consent');
const dashboardRoutes = require('./routes/dashboard');
const communityPostsRoutes = require('./routes/communityPosts');
const pollsRoutes = require('./routes/polls');
const feedbackRoutes = require('./routes/feedback');
const recoRoutes = require('./routes/reco');
const merchRoutes = require('./routes/merchandise');
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
app.use('/api/community-posts', communityPostsRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reco', recoRoutes);
app.use('/api/merch', merchRoutes);
app.use('/api/auth', limiter, authRoutes);

module.exports = app;
