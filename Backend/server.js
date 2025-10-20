require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
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

const resolveSslConfig = () => {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  if (mode) {
    if (mode === 'disable') {
      return false;
    }
    if (mode === 'verify-full') {
      return { rejectUnauthorized: true };
    }
///
    // Treat allow/prefer/require/no-verify the same: enable SSL but don't
    // require a CA bundle (common for managed Postgres providers).
    return { rejectUnauthorized: false };
  }

  // Managed providers such as Render/Supabase typically require TLS even
  // when the connection string does not include an explicit sslmode flag.
  if (process.env.DATABASE_URL) {
    return { rejectUnauthorized: false };
  }

  return undefined;
};

const createPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: resolveSslConfig()
    };
  }

  const password = process.env.PGPASSWORD;
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'mus_auth',
    ssl: resolveSslConfig(),
    ...(password ? { password } : {})
  };
};

const poolConfig = createPoolConfig();
let pool = new Pool(poolConfig);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const isPlaceholderHost = (host) => host.includes('example.com');

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

const otpStore = new Map();
const ipCooldown = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const createOtpRecord = (email, now = Date.now()) => {
  const code = generateOtp();
  const record = {
    code,
    expires: now + OTP_EXPIRY_MS,
    lastRequest: now
  };
  otpStore.set(email, record);
  return record;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const direct = req.ip || req.connection?.remoteAddress || '';
  return direct || null;
};

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

const createDatabaseIfMissing = async () => {
  if (process.env.DATABASE_URL) {
    throw new Error('Automatic database creation is not supported when using DATABASE_URL.');
  }

  const targetDb = poolConfig.database;
  if (!targetDb) {
    throw new Error('PGDATABASE must be specified when DATABASE_URL is not set.');
  }

  const adminDatabase = process.env.PGROOT_DB || 'postgres';
  const adminPool = new Pool({ ...poolConfig, database: adminDatabase });

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(targetDb)}`);
    console.info(`Created missing database "${targetDb}" using admin database "${adminDatabase}".`);
  } catch (error) {
    if (error.code === '42P04') {
      console.info(`Database "${targetDb}" already exists. Continuing.`);
      return;
    }
    throw error;
  } finally {
    await adminPool.end();
  }
};

const ensureDatabase = async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          role TEXT NOT NULL,
          first_name TEXT,
          last_name TEXT,
          email TEXT NOT NULL UNIQUE,
          student_id TEXT,
          phone TEXT,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '3D000' && !process.env.DATABASE_URL) {
      console.warn(
        `Database "${poolConfig.database}" was not found. Attempting to create it via admin database "${process.env.PGROOT_DB || 'postgres'}"...`
      );
      await createDatabaseIfMissing();
      await pool.end().catch(() => {});
      pool = new Pool(poolConfig);
      await ensureDatabase();
      return;
    }

    if (error.code === '28P01') {
      console.error(
        'PostgreSQL rejected the supplied credentials. Verify PGUSER/PGPASSWORD or adjust local trust authentication settings.'
      );
    }

    throw error;
  }
};

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Utility helpers -----------------------------------------------------------
const queryOne = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
};

const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, (err, hashed) => {
      if (err) reject(err);
      else resolve(hashed);
    });
  });

const comparePassword = (password, hash) =>
  new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (err, match) => {
      if (err) reject(err);
      else resolve(match);
    });
  });

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

// Routes --------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
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
    const insertResult = await pool.query(
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
        otpStore.delete(normalizedEmail);
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

app.post('/api/auth/request-otp', async (req, res) => {
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

  if (ipAddress) {
    const lastIpRequest = ipCooldown.get(ipAddress);
    if (lastIpRequest && now - lastIpRequest < OTP_IP_COOLDOWN_MS) {
      const remaining = Math.ceil((OTP_IP_COOLDOWN_MS - (now - lastIpRequest)) / 1000);
      return respondWithError(
        res,
        429,
        `Too many OTP requests from this network. Please wait ${remaining} seconds.`
      );
    }
  }

  const previousRequest = otpStore.get(normalizedEmail);
  if (previousRequest && now - previousRequest.lastRequest < OTP_EMAIL_COOLDOWN_MS) {
    const remaining = Math.ceil((OTP_EMAIL_COOLDOWN_MS - (now - previousRequest.lastRequest)) / 1000);
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
      ipCooldown.set(ipAddress, now);
    }

    try {
      await sendOtpEmail(normalizedEmail, code);
    } catch (error) {
      otpStore.delete(normalizedEmail);
      console.error('Failed to send OTP email:', error);
      return respondWithError(res, 502, 'We could not send the verification email. Please try again later.');
    }

    res.json({ success: true, message: 'A verification code has been sent to your email.' });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    respondWithError(res, 500, 'An unexpected error occurred while generating the code.');
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, code } = req.body || {};

  if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
    return respondWithError(res, 400, 'Email and code are required.');
  }

  const normalizedEmail = sanitizeEmail(email);
  const sanitizedCode = code.trim();

  const record = otpStore.get(normalizedEmail);
  if (!record) {
    return respondWithError(res, 400, 'No code has been requested for this email yet.');
  }

  if (record.expires < Date.now()) {
    otpStore.delete(normalizedEmail);
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
    otpStore.delete(normalizedEmail);
    return respondWithError(res, 404, 'No account was found for this email. Please register first.');
  }

    otpStore.delete(normalizedEmail);

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

app.post('/api/auth/login', async (req, res) => {
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

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Authentication server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize the database schema', error);
    process.exit(1);
  });
