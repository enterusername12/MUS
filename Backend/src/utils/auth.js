const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/env');

const toPositiveInt = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const readJwtUserId = (req) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
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

  return readJwtUserId(req);
};

module.exports = {
  readJwtUserId,
  readUserIdFromRequest
};