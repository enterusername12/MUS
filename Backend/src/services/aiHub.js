// src/services/aiHub.js
const { AI_HUB_URL, AI_TIMEOUT_MS } = require('../config/env');

const timeout = Number(AI_TIMEOUT_MS) || 12_000;

async function _jsonFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`AI Hub ${res.status} ${res.statusText} -> ${txt}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getEventRecommendations({ userId, k = 8, alpha = 0.6, lambdaDecay = 0.02, futureOnly = true }) {
  const qs = new URLSearchParams({
    user_id: String(userId),
    k: String(k),
    alpha: String(alpha),
    lambda_decay: String(lambdaDecay),
    future_only: String(futureOnly),
  });
  const url = `${AI_HUB_URL}/recommend?${qs.toString()}`;
  return _jsonFetch(url, { method: 'GET' });
}

async function logInteraction({ userId, contentId, contentType, action, timestamp }) {
  const url = `${AI_HUB_URL}/interact`;
  
  // Updated payload to match new Python schema
  const body = { 
    user_id: String(userId), 
    content_id: String(contentId), 
    content_type: contentType || 'event', // Default to 'event' if missing
    action, 
    timestamp 
  };

  return _jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getAiHealth() {
  return _jsonFetch(`${AI_HUB_URL}/health`, { method: 'GET' });
}

async function updateUserInterestsEmbedding({ userId, interestsText }) {
  if (!AI_HUB_URL) {
    return { skipped: true, reason: "no_ai_hub_url" };
  }

  return _jsonFetch(`${AI_HUB_URL}/embed_interests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: Number(userId),
      text: interestsText,
    }),
  });
}
async function getDashboardRecommendations({
  userId,
  kHeadline = 12,
  kPosts = 6,
  kPolls = 6,
  useCache = true,
}) {
  if (!AI_HUB_URL) return null;

  const endpoint = useCache
    ? "/recommend_dashboard_cached"
    : "/recommend_dashboard";

  const url = new URL(endpoint, AI_HUB_URL);
  url.searchParams.set("user_id", String(userId));
  url.searchParams.set("k_headline", String(kHeadline));
  url.searchParams.set("k_posts", String(kPosts));
  url.searchParams.set("k_polls", String(kPolls));
  url.searchParams.set("future_only", "true");

  return _jsonFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

async function getVisitorDashboardRecommendations({
  interestsText,
  kHeadline = 12,
  kPosts = 6,
  kPolls = 6,
}) {
  if (!AI_HUB_URL) return null;

  const url = new URL("/recommend_dashboard_ephemeral", AI_HUB_URL);

  return _jsonFetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      interests_text: interestsText,
      k_headline: kHeadline,
      k_posts: kPosts,
      k_polls: kPolls,
      future_only: true,
    }),
  });
}

async function embedContent({ type, id, text }) {
  if (!AI_HUB_URL) return { skipped: true };
  
  const url = `${AI_HUB_URL}/embed`;
  return _jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content_type: type,
      content_id: Number(id),
      text: text
    })
  });
}


module.exports = {
  getEventRecommendations,
  logInteraction,
  getAiHealth,
  updateUserInterestsEmbedding, 
  getDashboardRecommendations,
  getVisitorDashboardRecommendations,
  embedContent, // 🟢 <--- ADD THIS LINE
};