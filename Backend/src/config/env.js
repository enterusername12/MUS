require('dotenv').config();

const readEnv = (key) => {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const OTP_EXPIRY_MS = parsePositiveNumber(process.env.OTP_EXPIRY_MS, 5 * 60 * 1000);
const OTP_EMAIL_COOLDOWN_MS = parsePositiveNumber(process.env.OTP_EMAIL_COOLDOWN_MS, 2 * 60 * 1000);
const OTP_IP_COOLDOWN_MS = parsePositiveNumber(process.env.OTP_IP_COOLDOWN_MS, 2 * 60 * 1000);

const PORT = parsePositiveNumber(process.env.PORT, 3000);
const JWT_SECRET = readEnv('JWT_SECRET') || 'change-me-in-production';

module.exports = {
  readEnv,
  parsePositiveNumber,
  OTP_EXPIRY_MS,
  OTP_EMAIL_COOLDOWN_MS,
  OTP_IP_COOLDOWN_MS,
  PORT,
  JWT_SECRET
};