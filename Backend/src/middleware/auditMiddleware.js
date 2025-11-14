const fs = require('fs');
const path = require('path');

// Logs directory and file
const logDir = path.join(__dirname, '../logs');
const logFile = path.join(logDir, 'audit.log');

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 🔥 Create a write stream → MUCH faster than appendFile
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const auditMiddleware = (req, res, next) => {
  // Only log POST requests
  if (req.method !== 'POST') return next();

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const logEntry =
      `${new Date().toISOString()} [${req.method}] ${req.originalUrl} from ${ip} ` +
      `Status: ${res.statusCode}, Duration: ${duration}ms\n`;

    // 🔥 NON-BLOCKING logging
    logStream.write(logEntry);
  });

  next();
};

module.exports = auditMiddleware;
