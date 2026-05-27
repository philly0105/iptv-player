const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');

// GET /api/users — list all users (admin only)
router.get('/', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const allUsers = await db.users.getAll();
        res.json(allUsers.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            createdAt: u.createdAt,
        })));
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/users — create user (admin only)
router.post('/', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, and role required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        if (!['admin', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Role must be admin or viewer' });
        }

        const passwordHash = await auth.hashPassword(password);
        const newUser = await db.users.create({ username, passwordHash, role });

        res.json({ id: newUser.id, username: newUser.username, role: newUser.role, createdAt: newUser.createdAt });
    } catch (err) {
        if (err.message === 'Username already exists') {
            return res.status(400).json({ error: err.message });
        }
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/users/:id — update user (admin only)
router.put('/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { username, password, role } = req.body;

        const updates = {};

        if (username) updates.username = username;

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            updates.passwordHash = await auth.hashPassword(password);
        }

        if (role) {
            if (!['admin', 'viewer'].includes(role)) {
                return res.status(400).json({ error: 'Role must be admin or viewer' });
            }
            updates.role = role;
        }

        const updated = await db.users.update(userId, updates);
        res.json({ id: updated.id, username: updated.username, role: updated.role, createdAt: updated.createdAt });
    } catch (err) {
        if (err.message === 'User not found') return res.status(404).json({ error: err.message });
        if (err.message === 'Username already exists') return res.status(400).json({ error: err.message });
        if (err.message.includes('last admin')) return res.status(400).json({ error: err.message });
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/users/:id — delete user (admin only)
router.delete('/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (userId === req.session?.userId || userId === req.user?.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await db.users.delete(userId);
        res.json({ success: true });
    } catch (err) {
        if (err.message === 'User not found') return res.status(404).json({ error: err.message });
        if (err.message.includes('last admin')) return res.status(400).json({ error: err.message });
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
