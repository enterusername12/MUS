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

const calendarRoutes = require('./routes/calendar');
const eventRoutes = require('./routes/events');
const competitionRoutes = require('./routes/competitions');

const limiter = require('./middleware/rateLimit');
const postLimiter = require('./middleware/rateLimit');
const auditRoutes = require('./routes/audit'); // fetch logs
const auditMiddleware = require('./middleware/auditMiddleware');

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

// Apply audit middleware globally (so all routes can log actions)
app.use(auditMiddleware);

// Auth & core routes
app.use('/api/auth', limiter, authRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/community-posts', postLimiter, communityPostsRoutes);
app.use('/api/polls', limiter, pollsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reco', recoRoutes);
app.use('/api/merch', merchRoutes);

// Calendar & event routes
app.use('/api/calendar', calendarRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/competitions', competitionRoutes);
// Backwards-compatible alias used by some frontend code
app.use('/api/competition', competitionRoutes);

// Audit log route
app.use('/logs', auditRoutes);

module.exports = app;
