const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/env');

const toPositiveInt = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const readCookieValue = (req, name) => {
  if (!req) return null;

  if (req.cookies && typeof req.cookies === 'object') {
    const direct = req.cookies[name];
    if (direct) return direct;
  }

  const rawCookie = req.headers?.cookie;
  if (!rawCookie || typeof rawCookie !== 'string') {
    return null;
  }

  const parts = rawCookie.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (key?.trim() === name) {
      return decodeURIComponent(rest.join('=') || '');
    }
  }

  return null;
};

const readJwtUserId = (req) => {
  const authHeader = req?.headers?.authorization;
  const [scheme, tokenFromHeader] = typeof authHeader === 'string' ? authHeader.split(' ') : [];
  const bearerToken = scheme?.toLowerCase() === 'bearer' && tokenFromHeader ? tokenFromHeader : null;
  const cookieToken = readCookieValue(req, 'musAuthToken');
  const token = bearerToken || cookieToken;

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return toPositiveInt(payload?.sub);
  } catch (error) {
    return null;
  }
};

const readUserIdFromRequest = (req) => {
  const sessionUserId = toPositiveInt(req?.session?.userId ?? req?.session?.user?.id);
  if (sessionUserId) return sessionUserId;

  const attachedUserId = toPositiveInt(req?.userId ?? req?.user?.id);
  if (attachedUserId) return attachedUserId;

  const headerUserId = toPositiveInt(req?.headers?.['x-user-id']);
  if (headerUserId) return headerUserId;
  
  return readJwtUserId(req);
};

module.exports = {
  readJwtUserId,
  readUserIdFromRequest
};