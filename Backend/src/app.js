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
const limiter = require('./middleware/rateLimit');
const postLimiter = require('./middleware/rateLimit');
const auditRoutes = require('./routes/audit'); // fetch logs
const auditMiddleware = require('./middleware/auditMiddleware'); // adjust the path
const competitionRoutes = require('./routes/Competition');


const rewardRoute = require("./routes/rewardRoute");

const app = express();

app.set('trust proxy', false);
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
app.use('/api/consent', consentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/community-posts', postLimiter, communityPostsRoutes);
app.use('/api/polls', limiter, pollsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reco', recoRoutes);
app.use('/api/merch', merchRoutes);
app.use('/api/auth', limiter, authRoutes);
app.use('/logs', auditRoutes);
app.use('/api/competition', competitionRoutes);
app.use("/api/reward", rewardRoute);

module.exports = app;

// If your routes folder is inside src/


