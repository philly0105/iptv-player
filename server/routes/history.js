const express = require('express');
const router = express.Router();
const { getDb } = require('../db/sqlite');
const { requireAuth } = require('../auth');
const { validateBody, capInt } = require('../middleware/validate');

// Middleware to ensure authentication
router.use(requireAuth);

/**
 * GET /api/history
 * Returns the watch history for the authenticated user
 */
router.get('/', capInt('limit', 200, 20), (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const limit = req.query.limit;

        const rows = db.prepare(`
            SELECT * FROM watch_history 
            WHERE user_id = ? 
            ORDER BY updated_at DESC 
            LIMIT ?
        `).all(userId, limit);

        const history = rows.map(row => ({
            ...row,
            data: JSON.parse(row.data || '{}')
        }));

        res.json(history);
    } catch (err) {
        console.error('[History] Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * POST /api/history
 * Saves/updates watch progress for an item
 */
router.post('/',
    validateBody({
        id:       { type: 'string', required: true, maxLength: 256 },
        type:     { type: 'string', required: true, maxLength: 64 },
        parentId: { type: 'string', maxLength: 256 },
        progress: { type: 'number', min: 0 },
        duration: { type: 'number', min: 0 },
        sourceId: { type: 'string', maxLength: 64 },
        data:     {},
    }),
    (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id, type, parentId, progress, duration, data, sourceId } = req.body;

        const compositeId = `${userId}:${id}`;
        const timestamp = Date.now();

        const stmt = db.prepare(`
            INSERT INTO watch_history (id, user_id, source_id, item_type, item_id, parent_id, progress, duration, updated_at, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                source_id = excluded.source_id,
                progress = excluded.progress,
                duration = excluded.duration,
                updated_at = excluded.updated_at,
                data = excluded.data
        `);

        stmt.run(
            compositeId,
            userId,
            sourceId || null,
            type,
            id.toString(),
            parentId ? parentId.toString() : null,
            progress || 0,
            duration || 0,
            timestamp,
            JSON.stringify(data || {})
        );

        res.json({ success: true, timestamp });
    } catch (err) {
        console.error('[History] Error saving progress:', err);
        res.status(500).json({ error: 'Failed to save progress' });
    }
});

/**
 * DELETE /api/history/:itemId
 * Removes an item from the user's watch history
 */
router.delete('/:itemId', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const itemId = req.params.itemId;

        const compositeId = `${userId}:${itemId}`;

        const stmt = db.prepare('DELETE FROM watch_history WHERE id = ? AND user_id = ?');
        const result = stmt.run(compositeId, userId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Item not found in history' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[History] Error deleting history item:', err);
        res.status(500).json({ error: 'Failed to delete history item' });
    }
});

module.exports = router;
