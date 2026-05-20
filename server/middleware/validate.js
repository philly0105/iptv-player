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
 */
function requireLocalhost(req, res, next) {
    const addr = req.socket?.remoteAddress || '';
    const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!isLocal) {
        return res.status(403).json({ error: 'Forbidden - local access only' });
    }
    next();
}

/**
 * Validate a URL query parameter — returns 400 if absent or not http/https.
 * Usage: router.get('/stream', safeUrl('url'), handler)
 */
function safeUrl(param) {
    return (req, res, next) => {
        const raw = req.query[param];
        if (!raw) {
            return res.status(400).json({ error: `Query parameter '${param}' is required` });
        }
        if (typeof raw !== 'string' || raw.length > 4096) {
            return res.status(400).json({ error: `Query parameter '${param}' is invalid` });
        }
        try {
            const parsed = new URL(raw);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return res.status(400).json({ error: `Query parameter '${param}' must be an http or https URL` });
            }
        } catch {
            return res.status(400).json({ error: `Query parameter '${param}' must be a valid URL` });
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

module.exports = { validateBody, requireLocalhost, safeUrl, capInt };
