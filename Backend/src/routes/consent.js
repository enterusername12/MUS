const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { getPool } = require('../db');
const { JWT_SECRET } = require('../config/env');

const router = express.Router();

const SESSION_COOKIE = 'consent_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 1 year

const parseCookies = (cookieHeader = '') => {
  if (!cookieHeader or typeof cookieHeader !== 'string') {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, segment) => {
    const [name, ...rawValue] = segment.split('=');
    if (!name) {
      return acc;
    }

    const key = name.trim();
    if (!key) {
      return acc;
    }

    acc[key] = decodeURIComponent(rawValue.join('=').trim());
    return acc;
  }, {});
};

const readSessionToken = (req) => {
  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token || typeof token !== 'string' || !token.trim()) {
    return null;
  }
  return token.trim();
};

const ensureSessionToken = (req) => readSessionToken(req) || crypto.randomBytes(24).toString('hex');

const readJwtUserId = (req) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = Number(payload?.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch (error) {
    return null;
  }
};

const normalizePreferences = (source = {}) => ({
  essential: true,
  analytics: Boolean(source.analytics),
  email: Boolean(source.email),
  payment: Boolean(source.payment),
  ai: Boolean(source.ai)
});

const rowToPreferences = (row) => ({
  essential: true,
  analytics: Boolean(row?.analytics),
  email: Boolean(row?.email),
  payment: Boolean(row?.payment),
  ai: Boolean(row?.ai)
});

const respondWithPreferences = (res, preferences, sessionToken, shouldSetCookie) => {
  if (shouldSetCookie && sessionToken) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: SESSION_MAX_AGE_MS,
      path: '/'
    });
  }

  res.json({ success: true, preferences });
};

router.get('/', async (req, res) => {
  const userId = readJwtUserId(req);
  const sessionToken = readSessionToken(req);

  try {
    let row = null;

    if (userId) {
      const result = await getPool().query('SELECT * FROM user_consent WHERE user_id = $1', [userId]);
      if (result.rowCount > 0) {
        row = result.rows[0];
      }
    }

    if (!row && sessionToken) {
      const result = await getPool().query('SELECT * FROM user_consent WHERE session_token = $1', [sessionToken]);
      if (result.rowCount > 0) {
        row = result.rows[0];
      }
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'No consent preferences found.' });
    }

    respondWithPreferences(res, rowToPreferences(row), sessionToken, !userId && !!sessionToken);
  } catch (error) {
    console.error('Failed to load consent preferences', error);
    res.status(500).json({ success: false, message: 'Unable to load consent preferences.' });
  }
});

router.post('/', async (req, res) => {
  const userId = readJwtUserId(req);
  const rawPreferences = req.body?.preferences ?? req.body;

  if (!rawPreferences || typeof rawPreferences !== 'object') {
    return res.status(400).json({ success: false, message: 'Consent preferences must be provided.' });
  }

  const preferences = normalizePreferences(rawPreferences);
  const sessionToken = userId ? readSessionToken(req) : ensureSessionToken(req);

  try {
    if (userId) {
      await getPool().query(
        `INSERT INTO user_consent (user_id, essential, analytics, email, payment, ai)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           essential = EXCLUDED.essential,
           analytics = EXCLUDED.analytics,
           email = EXCLUDED.email,
           payment = EXCLUDED.payment,
           ai = EXCLUDED.ai,
           updated_at = NOW()`,
        [
          userId,
          preferences.essential,
          preferences.analytics,
          preferences.email,
          preferences.payment,
          preferences.ai
        ]
      );

      if (sessionToken) {
        await getPool().query(
          `DELETE FROM user_consent WHERE session_token = $1 AND user_id IS NULL`,
          [sessionToken]
        );
      }

      return respondWithPreferences(res, preferences, null, false);
    }

    const result = await getPool().query(
      `INSERT INTO user_consent (session_token, essential, analytics, email, payment, ai)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_token) DO UPDATE SET
         essential = EXCLUDED.essential,
         analytics = EXCLUDED.analytics,
         email = EXCLUDED.email,
         payment = EXCLUDED.payment,
         ai = EXCLUDED.ai,
         updated_at = NOW()
       RETURNING session_token`,
      [
        sessionToken,
        preferences.essential,
        preferences.analytics,
        preferences.email,
        preferences.payment,
        preferences.ai
      ]
    );

    const persistedToken = result.rows[0]?.session_token || sessionToken;
    respondWithPreferences(res, preferences, persistedToken, true);
  } catch (error) {
    console.error('Failed to store consent preferences', error);
    res.status(500).json({ success: false, message: 'Unable to save consent preferences.' });
  }
});

module.exports = router;
