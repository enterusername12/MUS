const express = require('express');
const jwt = require('../utils/jwt');

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
const DEFAULT_REDIRECT_PATH = '/Frontend/studentdashboard.html';
const ROLE_REDIRECTS = {
  student: '/Frontend/studentdashboard.html',
  'guest / visitor': '/Frontend/guestdashboard.html',
  guest: '/Frontend/guestdashboard.html',
  staff: '/Frontend/staffdashboard.html',
  'staff (admin only)': '/Frontend/staffdashboard.html',
  admin: '/Frontend/staffdashboard.html',
  'admin (admin only)': '/Frontend/staffdashboard.html'
};

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

const logUserLogin = async ({ userId, ipAddress, userAgent }) => {
  if (!userId) {
    return;
  }

  try {
    await getPool().query(
      `INSERT INTO user_login_history (user_id, ip_address, user_agent)
       VALUES ($1, $2, $3)`,
      [userId, toNullable(ipAddress), toNullable(userAgent)]
    );
  } catch (error) {
    console.error('Failed to record user login history:', error);
  }
};

// ===== Helpers for student identity generation =====
const getNextStudentNumber = async () => {
  // Only consider STU######## patterns, take the max, seed at 200000
  const row = await queryOne(
    `SELECT COALESCE(
       MAX(CAST(REGEXP_REPLACE(UPPER(student_id), '^STU', '') AS INTEGER)),
       200000
     ) AS max_num
     FROM users
     WHERE student_id ~* '^STU[0-9]+$'`
  );
  const next = (row?.max_num || 200000) + 1;
  return next;
};

const makeStudentId = (n) => `STU${n}`;
const makeOfficialEmail = (n) => `stu${n}@${STUDENT_EMAIL_DOMAIN}`;

// ===================== Routes =====================

router.post('/register', async (req, res) => {
  const {
    role,
    firstName = '',
    lastName = '',
    personalEmail,
    officialEmail,
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

  if (!personalEmail || typeof personalEmail !== 'string') {
    return respondWithError(res, 400, 'Personal email is required.');
  }

  const normalizedPersonalEmail = sanitizeEmail(personalEmail);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalizedPersonalEmail)) {
    return respondWithError(res, 400, 'Please enter a valid personal email address.');
  }

  // Official email is optional at registration (especially for students)
  const hasOfficialEmail = typeof officialEmail === 'string' && officialEmail.trim().length > 0;
  let normalizedOfficialEmail = hasOfficialEmail ? sanitizeEmail(officialEmail) : null;
  if (normalizedOfficialEmail && !emailPattern.test(normalizedOfficialEmail)) {
    return respondWithError(res, 400, 'Please enter a valid Murdoch email address.');
  }

  let canonicalStudentId = null;

  if (normalizedRole === STUDENT_ROLE) {
    // For students: only personalEmail is required now
    // studentId & officialEmail will be generated after OTP verification
  } else {
    // Non-students can optionally provide officialEmail/studentId
    const trimmedStudentId = trimOrEmpty(studentId);
    canonicalStudentId = trimmedStudentId || null;

    if (!normalizedOfficialEmail) {
      normalizedOfficialEmail = normalizedPersonalEmail;
    }
  }

  if (!normalizedOfficialEmail) {
    // Students proceed without officialEmail; it will be generated later
    normalizedOfficialEmail = null;
  }

  const trimmedPhone = trimOrEmpty(phone);
  if (!trimmedPhone) {
    return respondWithError(res, 400, 'Phone number is required.');
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return respondWithError(res, 400, 'Password must be at least 8 characters long.');
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return respondWithError(res, 400, 'Passwords do not match.');
  }

  try {
    if (!mailTransport || !EMAIL_FROM) {
      return respondWithError(
        res,
        503,
        'Email delivery is not configured. Registration cannot proceed until verification emails can be sent.'
      );
    }

    // Conflict checks (personal must be unique; official may be null at this stage)
    const conflict = await queryOne(
      'SELECT email, personal_email FROM users WHERE personal_email = $1 OR email = $2',
      [normalizedPersonalEmail, normalizedOfficialEmail]
    );
    if (conflict) {
      const conflictOfficial = sanitizeEmail(conflict.email || '');
      const conflictPersonal = sanitizeEmail(conflict.personal_email || '');
      if (conflictPersonal && conflictPersonal === normalizedPersonalEmail) {
        return respondWithError(res, 409, 'An account with this personal email already exists.');
      }
      if (
        normalizedOfficialEmail &&
        conflictOfficial &&
        conflictOfficial === normalizedOfficialEmail
      ) {
        return respondWithError(res, 409, 'An account with this Murdoch email already exists.');
      }
      return respondWithError(res, 409, 'An account with these details already exists.');
    }

    const passwordHash = await hashPassword(password);
    const pendingRegistration = {
      role: trimmedRole,
      firstName: toNullable(firstName),
      lastName: toNullable(lastName),
      personalEmail: normalizedPersonalEmail,
      officialEmail: normalizedOfficialEmail, // may be null for students
      studentId: canonicalStudentId,          // may be null
      phone: trimmedPhone,
      passwordHash
    };

    const now = Date.now();
    const { code } = createOtpRecord(normalizedPersonalEmail, {
      payload: pendingRegistration,
      purpose: 'registration',
      now
    });

    try {
      await sendOtpEmail(normalizedPersonalEmail, code);
    } catch (error) {
      deleteOtpRecord(normalizedPersonalEmail);
      console.error('Failed to send OTP after registration:', error);
      return respondWithError(
        res,
        502,
        'We could not send the verification email. Please try again later.'
      );
    }

    res.status(202).json({
      success: true,
      message: `Registration received. We've emailed a verification code to ${normalizedPersonalEmail}.`,
      otp: {
        sent: true,
        message: 'A verification code has been emailed to you. It expires in a few minutes.'
      }
    });
  } catch (error) {
    if (error?.code === '23505') {
      switch (error?.constraint) {
        case 'users_email_key':
          return respondWithError(res, 409, 'An account with this Murdoch email already exists.');
        case 'users_personal_email_uniq':
          return respondWithError(res, 409, 'An account with this personal email already exists.');
        case 'users_student_id_uniq':
          return respondWithError(res, 409, 'An account with this Student ID already exists.');
        default:
          return respondWithError(res, 409, 'An account with these details already exists.');
      }
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
      'SELECT id, email, personal_email FROM users WHERE email = $1 OR personal_email = $1',
      [normalizedEmail]
    );

    if (!user) {
      return respondWithError(res, 404, 'No account was found for this email. Please register first.');
    }

    // If official was entered, route OTP to personal; if personal was entered, still send to personal.
    const otpTargetEmail = sanitizeEmail(user.personal_email || normalizedEmail);

    const { code } = createOtpRecord(otpTargetEmail, { now, purpose: 'login' });

    if (ipAddress) {
      recordIpRequest(ipAddress, now);
    }

    try {
      await sendOtpEmail(otpTargetEmail, code);
    } catch (error) {
      deleteOtpRecord(otpTargetEmail);
      console.error('Failed to send OTP email:', error);
      return respondWithError(res, 502, 'We could not send the verification email. Please try again later.');
    }

    res.json({
      success: true,
      message: 'A verification code has been sent to your email.',
      otpEmailForVerification: otpTargetEmail // frontend should verify using this address
    });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    respondWithError(res, 500, 'An unexpected error occurred while generating the code.');
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string') {
    return respondWithError(res, 400, 'Email is required.');
  }

  if (!mailTransport || !EMAIL_FROM) {
    return respondWithError(
      res,
      503,
      'Email delivery is not configured. Password reset codes cannot be sent at this time.'
    );
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
      `Too many reset attempts from this network. Please wait ${remaining} seconds before trying again.`
    );
  }

  if (isEmailOnCooldown(normalizedEmail, now)) {
    const previousRequest = getOtpRecord(normalizedEmail);
    const remainingMs = previousRequest
      ? OTP_EMAIL_COOLDOWN_MS - (now - previousRequest.lastRequest)
      : OTP_EMAIL_COOLDOWN_MS;
    const remaining = Math.max(Math.ceil(remainingMs / 1000), 1);
    return respondWithError(
      res,
      429,
      `Please wait ${remaining} seconds before requesting another reset code.`
    );
  }

  try {
    const user = await queryOne('SELECT id, personal_email FROM users WHERE email = $1 OR personal_email = $1', [normalizedEmail]);

    if (!user) {
      return respondWithError(res, 404, 'No account was found for this email. Please register first.');
    }

    // Always send reset OTP to personal email
    const target = sanitizeEmail(user.personal_email || normalizedEmail);

    const { code } = createOtpRecord(target, {
      now,
      purpose: 'password-reset',
      payload: { userId: user.id }
    });

    if (ipAddress) {
      recordIpRequest(ipAddress, now);
    }

    try {
      await sendOtpEmail(target, code);
    } catch (error) {
      deleteOtpRecord(target);
      console.error('Failed to send password reset OTP:', error);
      return respondWithError(
        res,
        502,
        'We could not send the password reset email. Please try again later.'
      );
    }

    res.json({
      success: true,
      message: 'A password reset code has been sent to your email. It expires in a few minutes.'
    });
  } catch (error) {
    console.error('Error generating password reset OTP:', error);
    respondWithError(res, 500, 'An unexpected error occurred while generating the reset code.');
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body || {};

  if (!email || typeof email !== 'string') {
    return respondWithError(res, 400, 'Email is required.');
  }

  if (!code || typeof code !== 'string') {
    return respondWithError(res, 400, 'Reset code is required.');
  }

  if (!newPassword || typeof newPassword !== 'string') {
    return respondWithError(res, 400, 'New password is required.');
  }

  if (newPassword.length < 8) {
    return respondWithError(res, 400, 'Password must be at least 8 characters long.');
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return respondWithError(res, 400, 'New password and confirmation do not match.');
  }

  const normalizedEmail = sanitizeEmail(email);
  const sanitizedCode = code.trim();
  const record = getOtpRecord(normalizedEmail);

  if (!record || record.purpose !== 'password-reset') {
    return respondWithError(res, 400, 'No password reset code has been requested for this email.');
  }

  if (record.expires < Date.now()) {
    deleteOtpRecord(normalizedEmail);
    return respondWithError(res, 400, 'That reset code has expired. Please request a new one.');
  }

  if (record.code !== sanitizedCode) {
    return respondWithError(res, 400, 'Invalid reset code. Please double-check and try again.');
  }

  try {
    const user = await queryOne('SELECT id FROM users WHERE email = $1 OR personal_email = $1', [normalizedEmail]);

    if (!user) {
      deleteOtpRecord(normalizedEmail);
      return respondWithError(res, 404, 'No account found for this email.');
    }

    if (record.payload && record.payload.userId && record.payload.userId !== user.id) {
      deleteOtpRecord(normalizedEmail);
      return respondWithError(res, 400, 'The reset code is no longer valid. Please request a new one.');
    }

    const passwordHash = await hashPassword(newPassword);
    const updateResult = await getPool().query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [passwordHash, user.id]
    );

    if (updateResult.rowCount === 0) {
      deleteOtpRecord(normalizedEmail);
      return respondWithError(res, 404, 'No account found for this email.');
    }

    deleteOtpRecord(normalizedEmail);

    res.json({
      success: true,
      message: 'Your password has been reset successfully. You can now sign in with your new password.'
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    respondWithError(res, 500, 'An unexpected error occurred while resetting the password.');
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
    if (record.purpose && record.purpose !== 'registration' && record.purpose !== 'login') {
      return respondWithError(res, 400, 'That code cannot be used for account verification.');
    }

    if (!record.payload) {
      // LOGIN via OTP
      const user = await queryOne(
        'SELECT id, role, first_name, last_name, email, personal_email, student_id, phone FROM users WHERE email = $1 OR personal_email = $1',
        [normalizedEmail]
      );

      if (!user) {
        return respondWithError(res, 404, 'No account found for this email.');
      }

      const redirectPath =
        ROLE_REDIRECTS[trimOrEmpty(user.role).toLowerCase()] || DEFAULT_REDIRECT_PATH;

      const ipAddress = getClientIp(req);
      const userAgent = trimOrEmpty(req.headers['user-agent']);

      await logUserLogin({ userId: user.id, ipAddress, userAgent });

      const token = jwt.sign(
        {
          sub: user.id,
          role: user.role,
          email: user.email
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      deleteOtpRecord(normalizedEmail);

      return res.json({
        success: true,
        message: 'Login successful via OTP.',
        token,
        redirectPath,
        user: {
          id: user.id,
          role: user.role,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          email: user.email,
          personalEmail: user.personal_email || '',
          studentId: user.student_id || '',
          phone: user.phone || ''
        }
      });
    }

    // REGISTRATION via OTP
    const {
      role: pendingRole,
      firstName: pendingFirstName,
      lastName: pendingLastName,
      personalEmail: pendingPersonalEmail,
      officialEmail: pendingOfficialEmail,
      studentId: pendingStudentId,
      phone: pendingPhone,
      passwordHash
    } = record.payload;

    const normalizedPendingPersonalEmail = sanitizeEmail(pendingPersonalEmail || normalizedEmail);
    let normalizedPendingOfficialEmail = sanitizeEmail(pendingOfficialEmail || ''); // may be empty
    let normalizedStudentId = trimOrEmpty(pendingStudentId) || null;

    if (trimOrEmpty(pendingRole).toLowerCase() === STUDENT_ROLE) {
      // Generate identity for students
      const nextNum = await getNextStudentNumber();
      normalizedStudentId = makeStudentId(nextNum);              // e.g., STU200001
      normalizedPendingOfficialEmail = makeOfficialEmail(nextNum); // e.g., stu200001@murdoch.edu.au
    } else {
      // Non-students fall back to personal email if official not provided
      if (!normalizedPendingOfficialEmail) normalizedPendingOfficialEmail = normalizedPendingPersonalEmail;
    }

    const conflict = await queryOne(
      'SELECT email, personal_email, student_id FROM users WHERE email = $1 OR personal_email = $2 OR student_id = $3',
      [normalizedPendingOfficialEmail, normalizedPendingPersonalEmail, normalizedStudentId]
    );
    if (conflict) {
      const conflictOfficial = sanitizeEmail(conflict.email || '');
      const conflictPersonal = sanitizeEmail(conflict.personal_email || '');
      const conflictStudentId = trimOrEmpty(conflict.student_id);

      if (conflictOfficial && conflictOfficial === normalizedPendingOfficialEmail) {
        return respondWithError(res, 409, 'An account with this Murdoch email already exists.');
      }
      if (conflictPersonal && conflictPersonal === normalizedPendingPersonalEmail) {
        return respondWithError(res, 409, 'An account with this personal email already exists.');
      }
      if (normalizedStudentId && conflictStudentId && conflictStudentId === normalizedStudentId) {
        return respondWithError(res, 409, 'An account with this Student ID already exists.');
      }
      return respondWithError(res, 409, 'An account with these details already exists.');
    }

    const insertResult = await getPool().query(
      `INSERT INTO users (role, first_name, last_name, email, personal_email, student_id, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, role, first_name, last_name, email, personal_email, student_id, phone`,
      [
        pendingRole,
        pendingFirstName ?? null,
        pendingLastName ?? null,
        normalizedPendingOfficialEmail,      // official (primary) email
        normalizedPendingPersonalEmail,      // personal email for OTP routing
        normalizedStudentId,                 // generated student ID (students only)
        pendingPhone ?? null,
        passwordHash
      ]
    );

    const userRow = insertResult.rows[0];

    const token = jwt.sign(
      {
        sub: userRow.id,
        role: userRow.role,
        email: userRow.email
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const normalizedRole = trimOrEmpty(userRow.role).toLowerCase();
    const redirectPath = ROLE_REDIRECTS[normalizedRole] || DEFAULT_REDIRECT_PATH;

    deleteOtpRecord(normalizedEmail);

    res.json({
      success: true,
      message: 'Account verified successfully.',
      token,
      redirectPath, // fixed typo from previous code
      user: {
        id: userRow.id,
        role: userRow.role,
        firstName: userRow.first_name || '',
        lastName: userRow.last_name || '',
        email: userRow.email,                // official email
        personalEmail: userRow.personal_email || '',
        studentId: userRow.student_id || '',
        phone: userRow.phone || ''
      }
    });
  } catch (error) {
    if (error?.code === '23505') {
      switch (error?.constraint) {
        case 'users_email_key':
          return respondWithError(res, 409, 'An account with this Murdoch email already exists.');
        case 'users_personal_email_uniq':
          return respondWithError(res, 409, 'An account with this personal email already exists.');
        case 'users_student_id_uniq':
          return respondWithError(res, 409, 'An account with this Student ID already exists.');
        default:
          return respondWithError(res, 409, 'An account with these details already exists.');
      }
    }
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
  const ipAddress = getClientIp(req);
  const userAgent = trimOrEmpty(req.headers['user-agent']);

  try {
    const user = await queryOne(
      'SELECT id, role, first_name, last_name, email, personal_email, student_id, phone, password_hash FROM users WHERE email = $1 OR personal_email = $1',
      [normalizedEmail]
    );

    if (!user) {
      return respondWithError(res, 401, 'Invalid email or password.');
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return respondWithError(res, 401, 'Invalid email or password.');
    }

    await logUserLogin({ userId: user.id, ipAddress, userAgent });

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const normalizedRole = trimOrEmpty(user.role).toLowerCase();
    const redirectPath = ROLE_REDIRECTS[normalizedRole] || DEFAULT_REDIRECT_PATH;

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      redirectPath,
      user: {
        id: user.id,
        role: user.role,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email,
        personalEmail: user.personal_email || '',
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
