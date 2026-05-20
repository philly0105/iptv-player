const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');
const { strictAuthLimiter } = require('../middleware/rateLimiter');
const { validateBody, requireLocalhost } = require('../middleware/validate');

// Configure Passport strategies
auth.configureLocalStrategy(
    async (username) => await db.users.getByUsername(username),
    async (password, hash) => await auth.verifyPassword(password, hash)
);

auth.configureJwtStrategy(
    async (id) => await db.users.getById(id)
);

// Configure Passport session serialization (required for OIDC)
auth.configureSessionSerialization(
    async (id) => await db.users.getById(id)
);

// Configure OIDC Strategy
auth.configureOidcStrategy(
    async (oidcId) => await db.users.getByOidcId(oidcId),
    async (email) => await db.users.getByEmail(email),
    async (userData) => await db.users.create(userData)
);

/**
 * Start OIDC Login
 * GET /api/auth/oidc/login
 */
router.get('/oidc/login', auth.passport.authenticate('openidconnect'));

/**
 * OIDC Callback
 * GET /api/auth/oidc/callback
 */
router.get('/oidc/callback',
    auth.passport.authenticate('openidconnect', { session: false, failureRedirect: '/login.html?error=SSO+Failed' }),
    (req, res) => {
        // Successful authentication
        const token = auth.generateToken(req.user);

        // Redirect to hompage with token
        res.redirect(`/?token=${token}`);
    }
);

/**
 * Check if initial setup is required
 * GET /api/auth/setup-required
 */
router.get('/setup-required', async (req, res) => {
    try {
        const userCount = await db.users.count();
        res.json({ setupRequired: userCount === 0 });
    } catch (err) {
        console.error('Error in /setup-required:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Initial setup - Create admin user
 * POST /api/auth/setup
 */
router.post('/setup',
    strictAuthLimiter,
    validateBody({
        username: { type: 'string', required: true, minLength: 1, maxLength: 64 },
        password: { type: 'string', required: true, minLength: 6, maxLength: 200 },
    }),
    async (req, res) => {
    try {
        const userCount = await db.users.count();

        // Check if setup already done
        if (userCount > 0) {
            return res.status(400).json({ error: 'Setup already completed' });
        }

        const { username, password } = req.body;

        // Create admin user
        const passwordHash = await auth.hashPassword(password);
        const adminUser = await db.users.create({
            username,
            passwordHash,
            role: 'admin'
        });

        // Generate token for immediate login
        const token = auth.generateToken(adminUser);

        res.status(201).json({
            message: 'Admin user created successfully',
            token,
            user: adminUser
        });
    } catch (err) {
        console.error('Error in /setup:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

/**
 * Auto-login from localhost — issues a token without credentials.
 * Only accessible from 127.0.0.1 / ::1 (the local machine).
 * GET /api/auth/autologin
 */
// requireLocalhost enforces the loopback-only restriction using the raw socket address.
router.get('/autologin', requireLocalhost, async (req, res) => {
    try {
        const allUsers = await db.users.getAll();
        const user = allUsers[0];
        if (!user) return res.redirect('/login.html');
        const token = auth.generateToken(user);
        res.send(`<!DOCTYPE html><html><head><script>
localStorage.setItem('authToken',${JSON.stringify(token)});
window.location.replace('/');
</script></head><body>Signing in...</body></html>`);
    } catch (err) {
        console.error('Autologin error:', err);
        res.redirect('/login.html');
    }
});

// JSON token endpoint — called by app.js checkAuth to skip the login screen.
router.get('/localtoken', requireLocalhost, async (req, res) => {
    try {
        const allUsers = await db.users.getAll();
        const user = allUsers[0];
        if (!user) return res.status(404).json({ error: 'No users found' });
        const token = auth.generateToken(user);
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Login with Passport Local Strategy
 * POST /api/auth/login
 */
router.post('/login',
    strictAuthLimiter,
    validateBody({
        username: { type: 'string', required: true, maxLength: 64 },
        password: { type: 'string', required: true, maxLength: 200 },
    }),
    (req, res, next) => {
    auth.passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Server error' });
        }

        if (!user) {
            return res.status(401).json({ error: info?.message || 'Invalid credentials' });
        }

        // Generate JWT token
        const token = auth.generateToken(user);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    })(req, res, next);
});

/**
 * Logout (client-side handles token removal)
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // This endpoint exists for consistency and future server-side token blacklisting
    res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', auth.requireAuth, async (req, res) => {
    try {
        const user = await db.users.getById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            role: user.role
        });
    } catch (err) {
        console.error('Error in /me:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get all users (admin only)
 * GET /api/auth/users
 */
router.get('/users', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const allUsers = await db.users.getAll();

        // Remove password hashes
        const users = allUsers.map(u => {
            const { passwordHash, ...userWithoutPassword } = u;
            return userWithoutPassword;
        });

        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Create a new user (admin only)
 * POST /api/auth/users
 */
router.post('/users',
    auth.requireAuth,
    auth.requireAdmin,
    validateBody({
        username: { type: 'string', required: true, minLength: 1, maxLength: 64 },
        password: { type: 'string', required: true, minLength: 6, maxLength: 200 },
        role:     { type: 'string', required: true, enum: ['admin', 'viewer'] },
    }),
    async (req, res) => {
    try {
        const { username, password, role } = req.body;

        const passwordHash = await auth.hashPassword(password);
        const newUser = await db.users.create({
            username,
            passwordHash,
            role
        });

        res.status(201).json(newUser);
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

/**
 * Update a user (admin only)
 * PUT /api/auth/users/:id
 */
router.put('/users/:id',
    auth.requireAuth,
    auth.requireAdmin,
    validateBody({
        username: { type: 'string', minLength: 1, maxLength: 64 },
        password: { type: 'string', minLength: 6, maxLength: 200 },
        role:     { type: 'string', enum: ['admin', 'viewer'] },
    }),
    async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role } = req.body;

        const updates = {};

        if (username) {
            updates.username = username;
        }

        if (password) {
            updates.passwordHash = await auth.hashPassword(password);
        }

        if (role) {

            // Prevent removing admin role from the last admin
            const user = await db.users.getById(id);
            if (user && user.role === 'admin' && role !== 'admin') {
                const allUsers = await db.users.getAll();
                const adminCount = allUsers.filter(u => u.role === 'admin').length;
                if (adminCount <= 1) {
                    return res.status(400).json({ error: 'Cannot remove admin role from the last admin user' });
                }
            }

            updates.role = role;
        }

        const updatedUser = await db.users.update(id, updates);
        res.json(updatedUser);
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

/**
 * Delete a user (admin only)
 * DELETE /api/auth/users/:id
 */
router.delete('/users/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await db.users.delete(id);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

module.exports = router;
