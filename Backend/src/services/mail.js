const nodemailer = require('nodemailer');
const { readEnv } = require('../config/pool');
const { OTP_EXPIRY_MS } = require('../config/env');
const { isPlaceholderHost } = require('../config/pool');

const createMailTransport = () => {
  let host = readEnv('SMTP_HOST');
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');

  if (!host && user.endsWith('@gmail.com')) {
    host = 'smtp.gmail.com';
  }

  if (host && isPlaceholderHost(host)) {
    console.warn(
      `SMTP_HOST is set to placeholder value "${host}". Update .env with your real SMTP server to enable OTP emails.`
    );
    return null;
  }

  const resolvedPort = Number(process.env.SMTP_PORT);
  const port = Number.isFinite(resolvedPort)
    ? resolvedPort
    : host === 'smtp.gmail.com'
    ? 465
    : 587;

  if (!host || !user || !pass) {
    if (host || user || pass) {
      console.warn(
        'Partial SMTP configuration detected. OTP emails are disabled until SMTP_HOST, SMTP_USER, and SMTP_PASS are set.'
      );
    } else {
      console.info('SMTP credentials not provided. OTP email delivery is disabled.');
    }
    return null;
  }

  const secureEnv = readEnv('SMTP_SECURE').toLowerCase();
  const secure = secureEnv ? ['1', 'true', 'yes', 'on'].includes(secureEnv) : port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });

  transporter
    .verify()
    .then(() => {
      console.info('SMTP transport verified successfully. OTP emails ready to send.');
    })
    .catch((error) => {
      console.warn('SMTP transport verification failed:', error.message);
    });

  return transporter;
};

const mailTransport = createMailTransport();
const EMAIL_FROM = readEnv('SMTP_FROM') || readEnv('SMTP_USER');

const sendOtpEmail = async (recipient, code) => {
  if (!mailTransport || !EMAIL_FROM) {
    throw new Error('Email transport is not configured. Set SMTP_* variables in .env.');
  }

  const subject = 'Your verification code';
  const html = `
    <p>Hello,</p>
    <p>Your one-time password is <strong>${code}</strong>.</p>
    <p>The code expires in ${Math.round(OTP_EXPIRY_MS / 60000)} minute(s). If you did not request this code you can safely ignore this email.</p>
  `;

  await mailTransport.sendMail({
    from: EMAIL_FROM,
    to: recipient,
    subject,
    text: `Your one-time password is ${code}. It expires in ${Math.round(OTP_EXPIRY_MS / 60000)} minute(s).`,
    html
  });
};

module.exports = {
  mailTransport,
  EMAIL_FROM,
  sendOtpEmail
};