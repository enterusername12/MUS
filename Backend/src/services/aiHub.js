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

async function logInteraction({ userId, eventId, action, timestamp }) {
  const url = `${AI_HUB_URL}/interact`;
  const body = { user_id: String(userId), event_id: String(eventId), action, timestamp };
  return _jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getAiHealth() {
  return _jsonFetch(`${AI_HUB_URL}/health`, { method: 'GET' });
}

module.exports = { getEventRecommendations, logInteraction, getAiHealth };
