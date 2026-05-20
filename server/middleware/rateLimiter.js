/**
 * Rate Limiting Middleware (OWASP: API4 - Unrestricted Resource Consumption)
 *
 * All limiters use standardised RateLimit-* response headers (RFC 6585 draft-7)
 * and return JSON 429 bodies so clients can parse the error cleanly.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Combine IP + authenticated user ID so per-IP limits cannot be bypassed by
// distributing requests across many accounts from a single origin.
const userKeyGenerator = (req) =>
    req.user?.id ? `${ipKeyGenerator(req)}:${req.user.id}` : ipKeyGenerator(req);

const json429 = (msg) => (_req, res) =>
    res.status(429).json({ error: msg });

/**
 * Strict: unauthenticated auth endpoints (login, setup).
 * 10 attempts per 15 minutes per IP — brute-force protection.
 */
const strictAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: json429('Too many authentication attempts. Please try again in 15 minutes.'),
});

/**
 * Sync: expensive background operations that hit external IPTV servers.
 * 5 triggers per 15 minutes per IP+user.
 */
const syncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: userKeyGenerator,
    handler: json429('Too many sync requests. Please wait before triggering another sync.'),
});

/**
 * Proxy: stream and image proxy requests.
 * 180 per minute per IP — high enough for normal playback, low enough to block scrapers.
 */
const proxyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: json429('Too many proxy requests. Please slow down.'),
});

/**
 * General API: authenticated CRUD operations.
 * 200 per minute per IP+user.
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: userKeyGenerator,
    handler: json429('Too many requests. Please slow down.'),
});

module.exports = { strictAuthLimiter, syncLimiter, proxyLimiter, apiLimiter };
