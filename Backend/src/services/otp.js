const { OTP_EXPIRY_MS, OTP_EMAIL_COOLDOWN_MS, OTP_IP_COOLDOWN_MS } = require('../config/env');

const otpStore = new Map();
const ipCooldown = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const createOtpRecord = (email, { payload = null, now = Date.now() } = {}) => {
  const code = generateOtp();
  const record = {
    code,
    expires: now + OTP_EXPIRY_MS,
    lastRequest: now,
    payload
  };
  otpStore.set(email, record);
  return record;
};

const getOtpRecord = (email) => otpStore.get(email) || null;

const deleteOtpRecord = (email) => otpStore.delete(email);

const consumeOtpPayload = (email) => {
  const record = otpStore.get(email);
  if (!record) {
    return null;
  }
  otpStore.delete(email);
  return record.payload ?? null;
};

const isEmailOnCooldown = (email, now = Date.now()) => {
  const record = getOtpRecord(email);
  return record ? now - record.lastRequest < OTP_EMAIL_COOLDOWN_MS : false;
};

const getIpLastRequest = (ip) => {
  if (!ip) return null;
  const lastRequest = ipCooldown.get(ip);
  return typeof lastRequest === 'number' ? lastRequest : null;
};

const isIpOnCooldown = (ip, now = Date.now()) => {
  const lastRequest = getIpLastRequest(ip);
  return typeof lastRequest === 'number' ? now - lastRequest < OTP_IP_COOLDOWN_MS : false;
};

const recordIpRequest = (ip, now = Date.now()) => {
  if (!ip) return;
  ipCooldown.set(ip, now);
};

setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (record.expires <= now) {
      otpStore.delete(email);
    }
  }

  for (const [ip, lastRequest] of ipCooldown.entries()) {
    if (now - lastRequest > OTP_IP_COOLDOWN_MS * 2) {
      ipCooldown.delete(ip);
    }
  }
}, 60 * 1000).unref?.();

module.exports = {
  createOtpRecord,
  getOtpRecord,
  deleteOtpRecord,
  consumeOtpPayload,
  isEmailOnCooldown,
  isIpOnCooldown,
  recordIpRequest,
  getIpLastRequest
};