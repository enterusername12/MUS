const express = require('express');
const jwt = require('jsonwebtoken');

const { getPool } = require('../db');
const { hashPassword, comparePassword } = require('../services/hash');
const { mailTransport, EMAIL_FROM, sendOtpEmail } = require('../services/mail');
const {
  createOtpRecord,
  getOtpRecord,
  deleteOtpRecord,
  isEmailOnCooldown,
  isIpOnCooldown,
  recordIpRequest,
  getIpLastRequest
} = require('../services/otp');
const { JWT_SECRET, OTP_EMAIL_COOLDOWN_MS, OTP_IP_COOLDOWN_MS } = require('../config/env');

const router = express.Router();

const sanitizeEmail = (email = '') => email.trim().toLowerCase();
const trimOrEmpty = (value) => (typeof value === 'string' ? value.trim() : '');
const toNullable = (value) => {
  const trimmed = trimOrEmpty(value);
  return trimmed.length > 0 ? trimmed : null;
};

const STUDENT_ROLE = 'student';
const STUDENT_EMAIL_DOMAIN = 'murdoch.edu.au';
const STUDENT_EMAIL_ERROR_MESSAGE =
  'Students must use their Murdoch University email address (e.g. your.name@murdoch.edu.au). Gmail addresses are not accepted.';

const isAllowedMurdochEmailDomain = (domain) =>
  domain === STUDENT_EMAIL_DOMAIN || domain.endsWith(`.${STUDENT_EMAIL_DOMAIN}`);

const respondWithError = (res, statusCode, message) => {
  res.status(statusCode).json({ success: false, message });
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const direct = req.ip || req.connection?.remoteAddress || '';
  return direct || null;
};

const queryOne = async (sql, params = []) => {
  const result = await getPool().query(sql, params);
  return result.rows[0] || null;
};

router.post('/register', async (req, res) => {
  const {
    role,
    firstName = '',
    lastName = '',
    email,
    studentId = '',
    phone = '',
    password,
    confirmPassword
  } = req.body || {};

  if (!role || typeof role !== 'string' || !role.trim()) {
    return respondWithError(res, 400, 'Please select a valid role.');
  }

  const trimmedRole = trimOrEmpty(role);
  const normalizedRole = trimmedRole.toLowerCase();

  if (!email || typeof email !== 'string') {
    return respondWithError(res, 400, 'Email is required.');
  }

  const normalizedEmail = sanitizeEmail(email);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalizedEmail)) {
    return respondWithError(res, 400, 'Please enter a valid email address.');
  }

  if (normalizedRole === STUDENT_ROLE) {
    const emailDomain = normalizedEmail.split('@')[1] || '';

    if (emailDomain.endsWith('gmail.com')) {
      return respondWithError(res, 400, STUDENT_EMAIL_ERROR_MESSAGE);
    }

    if (!isAllowedMurdochEmailDomain(emailDomain)) {
      return respondWithError(res, 400, STUDENT_EMAIL_ERROR_MESSAGE);
    }
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return respondWithError(res, 400, 'Password must be at least 8 characters long.');
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return respondWithError(res, 400, 'Passwords do not match.');
  }

  try {
    const existingUser = await queryOne('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existingUser) {
      return respondWithError(res, 409, 'An account with this email already exists.');
    }

    const passwordHash = await hashPassword(password);
    const insertResult = await getPool().query(
      `INSERT INTO users (role, first_name, last_name, email, student_id, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, role, first_name, last_name, email, student_id, phone`,
      [
        trimmedRole,
        toNullable(firstName),
        toNullable(lastName),
        normalizedEmail,
        toNullable(studentId),
        toNullable(phone),
        passwordHash
      ]
    );

    const userRow = insertResult.rows[0];
    const user = {
      id: userRow.id,
      role: userRow.role,
      firstName: userRow.first_name || '',
      lastName: userRow.last_name || '',
      email: userRow.email,
      studentId: userRow.student_id || '',
      phone: userRow.phone || ''
    };

    let otpNotice = {
      sent: false,
      message:
        'Email verification is currently unavailable. Configure SMTP_* variables and request a new code from the OTP page once email delivery is working.'
    };

    if (mailTransport && EMAIL_FROM) {
      const { code } = createOtpRecord(normalizedEmail);
      try {
        await sendOtpEmail(normalizedEmail, code);
        otpNotice = {
          sent: true,
          message: 'A verification code has been emailed to you. It expires in a few minutes.'
        };
      } catch (error) {
        deleteOtpRecord(normalizedEmail);
        console.error('Failed to send OTP after registration:', error);
        otpNotice = {
          sent: false,
          message: 'Your account was created but the verification email could not be sent. Try requesting a new code from the sign-in page.'
        };
      }
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user,
      otp: otpNotice
    });
  } catch (error) {
    if (error?.code === '23505') {
      return respondWithError(res, 409, 'An account with this email already exists.');
    }
    console.error('Error registering user:', error);
    respondWithError(res, 500, 'An unexpected error occurred while creating the account.');
  }
});

router.post('/request-otp', async (req, res) => {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string') {
    return respondWithError(res, 400, 'Email is required.');
  }

  if (!mailTransport || !EMAIL_FROM) {
    return respondWithError(res, 503, 'Email delivery is not configured. Please try again later.');
  }

  const normalizedEmail = sanitizeEmail(email);
  const ipAddress = getClientIp(req);
  const now = Date.now();

  if (isIpOnCooldown(ipAddress, now)) {
    const lastRequest = getIpLastRequest(ipAddress);
    const remainingMs = lastRequest ? OTP_IP_COOLDOWN_MS - (now - lastRequest) : OTP_IP_COOLDOWN_MS;
    const remaining = Math.max(Math.ceil(remainingMs / 1000), 1);
    return respondWithError(
      res,
      429,
      `Too many OTP requests from this network. Please wait ${remaining} seconds.`
    );
  }

  if (isEmailOnCooldown(normalizedEmail, now)) {
    const previousRequest = getOtpRecord(normalizedEmail);
    const remainingMs = previousRequest
      ? OTP_EMAIL_COOLDOWN_MS - (now - previousRequest.lastRequest)
      : OTP_EMAIL_COOLDOWN_MS;
    const remaining = Math.max(Math.ceil(remainingMs / 1000), 1);
    return respondWithError(res, 429, `Please wait ${remaining} seconds before requesting another code.`);
  }

  try {
    const user = await queryOne(
      'SELECT id, role, first_name, last_name, email, student_id, phone FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (!user) {
      return respondWithError(res, 404, 'No account was found for this email. Please register first.');
    }

    const { code } = createOtpRecord(normalizedEmail, now);

    if (ipAddress) {
      recordIpRequest(ipAddress, now);
    }

    try {
      await sendOtpEmail(normalizedEmail, code);
    } catch (error) {
      deleteOtpRecord(normalizedEmail);
      console.error('Failed to send OTP email:', error);
      return respondWithError(res, 502, 'We could not send the verification email. Please try again later.');
    }

    res.json({ success: true, message: 'A verification code has been sent to your email.' });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    respondWithError(res, 500, 'An unexpected error occurred while generating the code.');
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body || {};

  if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
    return respondWithError(res, 400, 'Email and code are required.');
  }

  const normalizedEmail = sanitizeEmail(email);
  const sanitizedCode = code.trim();

  const record = getOtpRecord(normalizedEmail);
  if (!record) {
    return respondWithError(res, 400, 'No code has been requested for this email yet.');
  }

  if (record.expires < Date.now()) {
    deleteOtpRecord(normalizedEmail);
    return respondWithError(res, 400, 'That code has expired. Please request a new one.');
  }

  if (record.code !== sanitizedCode) {
    return respondWithError(res, 400, 'Invalid code. Please double-check and try again.');
  }

  try {
    const user = await queryOne(
      'SELECT id, role, first_name, last_name, email, student_id, phone FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (!user) {
      deleteOtpRecord(normalizedEmail);
      return respondWithError(res, 404, 'No account was found for this email. Please register first.');
    }

    deleteOtpRecord(normalizedEmail);

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      message: 'Code verified successfully.',
      token,
      user: {
        id: user.id,
        role: user.role,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email,
        studentId: user.student_id || '',
        phone: user.phone || ''
      }
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    respondWithError(res, 500, 'An unexpected error occurred while verifying the code.');
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string') {
    return respondWithError(res, 400, 'Email is required.');
  }

  if (!password || typeof password !== 'string') {
    return respondWithError(res, 400, 'Password is required.');
  }

  const normalizedEmail = sanitizeEmail(email);

  try {
    const user = await queryOne(
      'SELECT id, role, first_name, last_name, email, student_id, phone, password_hash FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (!user) {
      return respondWithError(res, 401, 'Invalid email or password.');
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return respondWithError(res, 401, 'Invalid email or password.');
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        role: user.role,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email,
        studentId: user.student_id || '',
        phone: user.phone || ''
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    respondWithError(res, 500, 'An unexpected error occurred while signing in.');
  }
});

module.exports = router;