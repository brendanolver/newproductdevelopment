require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { runMigrations } = require('./db');
const { requireAuth } = require('./auth');
const { syncFromAM } = require('./lib/amSync');
const { startScheduledJobs } = require('./scheduledJobs');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const stageRoutes = require('./routes/stages');
const boardRoutes = require('./routes/board');
const amRoutes = require('./routes/am');
const teamMemberRoutes = require('./routes/teamMembers');
const emailRoutes = require('./routes/email');

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 min

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/products/:id/stages', requireAuth, stageRoutes);
app.use('/api/timeline', requireAuth, boardRoutes);
app.use('/api/am', requireAuth, amRoutes);
app.use('/api/team-members', requireAuth, teamMemberRoutes);
app.use('/api/email', requireAuth, emailRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`WNDRR Product Timeline listening on port ${PORT}`);
  });

  syncFromAM().catch((err) => console.error('Initial AM sync failed:', err.message));
  setInterval(() => {
    syncFromAM().catch((err) => console.error('Scheduled AM sync failed:', err.message));
  }, SYNC_INTERVAL_MS);

  startScheduledJobs();
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
