const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1,
  message: { status: 429, error: 'Too many POST requests.' },
  skip: (req) => req.method !== 'POST', // only limit POST
});

module.exports = postLimiter;
