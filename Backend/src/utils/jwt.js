const crypto = require('crypto');

const encodeJson = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const decodeJson = (segment) => {
  try {
    const decoded = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error('Invalid token segment');
  }
};

const normalizeExpiresIn = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24
  };
  return amount * (multipliers[unit] || 1);
};

const createSignature = (data, secret) =>
  crypto.createHmac('sha256', secret).update(data).digest('base64url');

function sign(payload, secret, options = {}) {
  if (!secret) {
    throw new Error('A JWT secret is required.');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const normalizedPayload = { ...payload };
  if (!Object.prototype.hasOwnProperty.call(normalizedPayload, 'iat')) {
    normalizedPayload.iat = issuedAt;
  }
  const expiresIn = normalizeExpiresIn(options.expiresIn);
  if (expiresIn) {
    normalizedPayload.exp = issuedAt + expiresIn;
  }

  const headerSegment = encodeJson(header);
  const payloadSegment = encodeJson(normalizedPayload);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = createSignature(signingInput, secret);
  return `${signingInput}.${signature}`;
}

function verify(token, secret) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token structure');
  }
  const [headerSegment, payloadSegment, signature] = parts;
  const header = decodeJson(headerSegment);
  if (header.alg !== 'HS256') {
    throw new Error('Unsupported algorithm');
  }
  const expected = createSignature(`${headerSegment}.${payloadSegment}`, secret);
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(signature, 'base64url'),
    Buffer.from(expected, 'base64url')
  );
  if (!isMatch) {
    throw new Error('Invalid signature');
  }
  const payload = decodeJson(payloadSegment);
  if (
    typeof payload.exp === 'number' &&
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('Token expired');
  }
  return payload;
}

module.exports = {
  sign,
  verify
};