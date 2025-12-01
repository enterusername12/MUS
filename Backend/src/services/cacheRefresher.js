// src/services/cacheRefresher.js
const { getPool } = require('../db');
const { getDashboardRecommendations } = require('./aiHub');
const { saveSuggestionRow } = require('./dashboardService');

/**
 * Background job to regenerate recommendations for all active users.
 * This ensures they see the newly created/deleted content immediately
 * if it matches their interests/history.
 */
async function refreshAllUserCaches() {
  const pool = getPool();
  console.log('[CacheRefresher] Starting global cache update...');

  try {
    // 1. Find all users who actually use the dashboard (have a cache record)
    // We don't want to calculate for users who never log in.
    const { rows } = await pool.query(
      `SELECT DISTINCT user_id FROM rec_suggestion_cache`
    );

    if (rows.length === 0) {
      console.log('[CacheRefresher] No users to update.');
      return;
    }

    console.log(`[CacheRefresher] Updating recommendations for ${rows.length} users...`);

    // 2. Loop through users and regenerate
    // We use Promise.allSettled to ensure one failure doesn't stop the whole batch
    const results = await Promise.allSettled(rows.map(async (row) => {
      const userId = row.user_id;

      // Call AI with useCache: false to force fresh calculation
      // The AI will automatically pull the user's interaction history & interests
      const aiResp = await getDashboardRecommendations({
        userId,
        kHeadline: 12,
        kPosts: 6,
        kPolls: 6,
        useCache: false // <--- CRITICAL: Forces AI to look at DB again
      });

      if (aiResp && (aiResp.headline || aiResp.posts || aiResp.polls)) {
        await saveSuggestionRow(userId, aiResp);
      }
    }));

    // 3. Log results
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[CacheRefresher] Complete. Updated ${successCount}/${rows.length} users.`);

  } catch (err) {
    console.error('[CacheRefresher] Critical failure:', err);
  }
}

module.exports = { refreshAllUserCaches };