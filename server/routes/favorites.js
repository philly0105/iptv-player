const express = require('express');
const router = express.Router();
const { favorites } = require('../db/sqlite');
const { requireAuth } = require('../auth');
const { validateBody } = require('../middleware/validate');

// All favorites routes require authentication
router.use(requireAuth);

// Get all favorites for current user
router.get('/', async (req, res) => {
    try {
        const { sourceId, itemType } = req.query;
        const items = favorites.getAll(req.user.id, sourceId || null, itemType || null);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add favorite for current user
router.post('/',
    validateBody({
        sourceId: { type: 'string', required: true, maxLength: 64 },
        itemId:   { type: 'string', required: true, maxLength: 256 },
        itemType: { type: 'string', enum: ['channel', 'movie', 'series'], default: 'channel' },
    }),
    async (req, res) => {
    try {
        const { sourceId, itemId, itemType } = req.body;

        favorites.add(req.user.id, sourceId, itemId, itemType);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove favorite for current user
router.delete('/',
    validateBody({
        sourceId: { type: 'string', required: true, maxLength: 64 },
        itemId:   { type: 'string', required: true, maxLength: 256 },
        itemType: { type: 'string', enum: ['channel', 'movie', 'series'], default: 'channel' },
    }),
    async (req, res) => {
    try {
        const { sourceId, itemId, itemType } = req.body;

        favorites.remove(req.user.id, sourceId, itemId, itemType);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check if item is favorited by current user
router.get('/check', async (req, res) => {
    try {
        const { sourceId, itemId, itemType = 'channel' } = req.query;
        if (!sourceId || !itemId) {
            return res.status(400).json({ error: 'Source ID and Item ID are required' });
        }

        const isFav = favorites.isFavorite(req.user.id, sourceId, itemId, itemType);
        res.json({ isFavorite: isFav });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

