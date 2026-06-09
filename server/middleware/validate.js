/**
 * Input Validation & Sanitisation Middleware (OWASP: A03 - Injection)
 *
 * validateBody(schema)  — validates req.body; strips unknown fields; returns 400 on failure.
 * requireLocalhost()    — restricts a route to loopback connections only.
 * safeUrl(param)        — validates a query-param is an http/https URL (returns 400 otherwise).
 * capInt(param, max)    — clamps an integer query param to [1, max].
 *
 * Schema field rules:
 *   type        'string' | 'number' | 'boolean' | 'array'
 *   required    boolean (default false)
 *   minLength   number  (strings)
 *   maxLength   number  (strings)
 *   min         number  (numbers)
 *   max         number  (numbers)
 *   enum        array   (allowed values)
 *   isUrl       boolean (must be http/https)
 *   default     value used when field absent and not required
 */

/**
 * Body validation — validates, sanitises, and strips unexpected fields from req.body.
 */
function validateBody(schema) {
    return (req, res, next) => {
        const errors = [];
        const sanitized = {};

        for (const [field, rules] of Object.entries(schema)) {
            const raw = req.body[field];
            const absent = raw === undefined || raw === null || raw === '';

            if (absent) {
                if (rules.required) {
                    errors.push(`'${field}' is required`);
                } else if (rules.default !== undefined) {
                    sanitized[field] = rules.default;
                }
                continue;
            }

            let value = raw;

            // Type checks & coercion
            if (rules.type === 'string') {
                if (typeof value !== 'string') {
                    errors.push(`'${field}' must be a string`);
                    continue;
                }
                value = value.trim();
            } else if (rules.type === 'number') {
                const n = Number(value);
                if (isNaN(n)) {
                    errors.push(`'${field}' must be a number`);
                    continue;
                }
                value = n;
            } else if (rules.type === 'boolean') {
                if (typeof value !== 'boolean') {
                    errors.push(`'${field}' must be a boolean`);
                    continue;
                }
            } else if (rules.type === 'array') {
                if (!Array.isArray(value)) {
                    errors.push(`'${field}' must be an array`);
                    continue;
                }
            }

            // String length
            if (typeof value === 'string') {
                if (rules.minLength !== undefined && value.length < rules.minLength) {
                    errors.push(`'${field}' must be at least ${rules.minLength} characters`);
                    continue;
                }
                if (rules.maxLength !== undefined && value.length > rules.maxLength) {
                    errors.push(`'${field}' must be at most ${rules.maxLength} characters`);
                    continue;
                }
            }

            // Number range
            if (typeof value === 'number') {
                if (rules.min !== undefined && value < rules.min) {
                    errors.push(`'${field}' must be at least ${rules.min}`);
                    continue;
                }
                if (rules.max !== undefined && value > rules.max) {
                    errors.push(`'${field}' must be at most ${rules.max}`);
                    continue;
                }
            }

            // Allowed values
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`'${field}' must be one of: ${rules.enum.join(', ')}`);
                continue;
            }

            // URL format
            if (rules.isUrl) {
                try {
                    const parsed = new URL(value);
                    if (!['http:', 'https:'].includes(parsed.protocol)) {
                        errors.push(`'${field}' must be an http or https URL`);
                        continue;
                    }
                } catch {
                    errors.push(`'${field}' must be a valid URL`);
                    continue;
                }
            }

            sanitized[field] = value;
        }

        if (errors.length > 0) {
            return res.status(400).json({ error: errors[0], details: errors });
        }

        // Replace body with only validated fields — drops unrecognised keys
        req.body = sanitized;
        next();
    };
}

/**
 * Restrict a route to loopback-only connections.
 * Uses the raw socket address (not req.ip) to prevent X-Forwarded-For spoofing.
 *
 * Also refuses any request that carries proxy-forwarding headers. When the app
 * runs behind a same-host reverse proxy (nginx/Caddy), the socket address is
 * always 127.0.0.1, which would otherwise let every proxied visitor pass this
 * check. The presence of X-Forwarded-For / X-Real-IP / Forwarded means the
 * request was relayed and is NOT a genuine local connection.
 */
function requireLocalhost(req, res, next) {
    if (process.env.ENABLE_LOCAL_AUTOLOGIN === 'false') {
        return res.status(403).json({ error: 'Forbidden - local auto-login disabled' });
    }
    const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['forwarded'];
    if (forwarded) {
        return res.status(403).json({ error: 'Forbidden - local access only' });
    }
    const addr = req.socket?.remoteAddress || '';
    const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!isLocal) {
        return res.status(403).json({ error: 'Forbidden - local access only' });
    }
    next();
}

const dns = require('dns').promises;
const net = require('net');

/**
 * Returns true if an IP literal falls inside a private, loopback, link-local,
 * carrier-grade-NAT, or otherwise non-public range. Blocking these prevents the
 * stream/image/transcode proxies from being abused for SSRF — reaching cloud
 * metadata (169.254.169.254), internal services, or scanning the LAN.
 */
function isBlockedIp(ip) {
    const type = net.isIP(ip);
    if (type === 4) {
        const o = ip.split('.').map(Number);
        if (o[0] === 0) return true;                         // 0.0.0.0/8
        if (o[0] === 10) return true;                        // 10/8 private
        if (o[0] === 127) return true;                       // 127/8 loopback
        if (o[0] === 169 && o[1] === 254) return true;       // 169.254/16 link-local (metadata)
        if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12 private
        if (o[0] === 192 && o[1] === 168) return true;       // 192.168/16 private
        if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // 100.64/10 CGNAT
        if (o[0] >= 224) return true;                        // multicast + reserved
        return false;
    }
    if (type === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;  // loopback / unspecified
        // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isBlockedIp(mapped[1]);
        if (lower.startsWith('fe80')) return true;           // link-local
        const first = parseInt(lower.split(':')[0] || '0', 16);
        if ((first & 0xfe00) === 0xfc00) return true;        // fc00::/7 unique-local
        return false;
    }
    return true; // not a valid IP literal → block
}

/**
 * Resolve a hostname and confirm none of its addresses are blocked. Also blocks
 * obvious internal names. Done at validation time to defeat DNS rebinding where
 * a public-looking hostname resolves to a private address.
 */
async function hostIsSafe(hostname) {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) {
        return false;
    }
    if (net.isIP(h)) {
        return !isBlockedIp(h);
    }
    try {
        const addrs = await dns.lookup(h, { all: true });
        if (!addrs.length) return false;
        return addrs.every(a => !isBlockedIp(a.address));
    } catch {
        return false; // cannot resolve → cannot verify → block
    }
}

async function validateOutboundUrl(raw) {
    if (!raw) return { ok: false, error: 'is required' };
    if (typeof raw !== 'string' || raw.length > 4096) return { ok: false, error: 'is invalid' };
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return { ok: false, error: 'must be a valid URL' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, error: 'must be an http or https URL' };
    }
    if (!(await hostIsSafe(parsed.hostname))) {
        return { ok: false, error: 'resolves to a disallowed address' };
    }
    return { ok: true };
}

/**
 * Validate a URL query parameter — http/https only, and not pointing at a
 * private/internal address. Async because it resolves DNS to block rebinding.
 * Usage: router.get('/stream', safeUrl('url'), handler)
 */
function safeUrl(param) {
    return async (req, res, next) => {
        const result = await validateOutboundUrl(req.query[param]);
        if (!result.ok) {
            return res.status(400).json({ error: `Query parameter '${param}' ${result.error}` });
        }
        next();
    };
}

/**
 * Same outbound-URL validation for a field in req.body (e.g. POST /transcode/session).
 */
function safeUrlBody(param) {
    return async (req, res, next) => {
        const result = await validateOutboundUrl(req.body?.[param]);
        if (!result.ok) {
            return res.status(400).json({ error: `Field '${param}' ${result.error}` });
        }
        next();
    };
}

/**
 * Clamp an integer query parameter to [1, max].
 * Replaces req.query[param] with a safe integer, falling back to defaultVal.
 */
function capInt(param, max, defaultVal) {
    return (req, res, next) => {
        let v = parseInt(req.query[param], 10);
        if (isNaN(v) || v < 1) v = defaultVal;
        if (v > max) v = max;
        req.query[param] = v;
        next();
    };
}

module.exports = { validateBody, requireLocalhost, safeUrl, safeUrlBody, capInt };
