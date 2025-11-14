const fs = require('fs');
const path = require('path');

// Logs directory and file
const logDir = path.join(__dirname, '../logs');
const logFile = path.join(logDir, 'audit.log');

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const auditMiddleware = (req, res, next) => {
  // Only log POST requests
  if (req.method !== 'POST') return next();

  const startTime = Date.now();

  // Listen to the finish event so we capture status code and response time
 res.on('finish', () => {
  const duration = Date.now() - startTime;
  const logEntry = `${new Date().toISOString()} [${req.method}] ${req.originalUrl} from ${req.ip} ` +
                   `Status: ${res.statusCode}, Duration: ${duration}ms\n`;
  fs.appendFile(logFile, logEntry, (err) => {
    if (err) console.error('❌ Failed to write audit log:', err);
  });
});


  // Catch errors inside middleware to prevent blocking
  try {
    next();
  } catch (error) {
    console.error('❌ Audit middleware error:', error);
    next(error); // pass to Express error handler
  }
};

module.exports = auditMiddleware;
