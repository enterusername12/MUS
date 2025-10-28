const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/env');

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
    const id = Number(payload?.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch (error) {
    return null;
  }
};

module.exports = {
  readJwtUserId
};
