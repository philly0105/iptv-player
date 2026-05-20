const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { recordings } = require('../db/sqlite');
const recordingService = require('../services/recordingService');
const { requireAuth } = require('../auth');

const recordingsDir = path.join(__dirname, '..', '..', 'data', 'recordings');

// GET /api/recordings/:id/download — no auth required (ID is a random hex token)
router.get('/:id/download', (req, res) => {
    const record = recordings.getById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Recording not found' });

    const filePath = path.join(recordingsDir, record.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
    res.setHeader('Content-Type', 'video/mp2t');
    fs.createReadStream(filePath).pipe(res);
});

router.use(requireAuth);

// POST /api/recordings/start
router.post('/start', (req, res) => {
    const { channelName, streamUrl } = req.body;
    if (!channelName || !streamUrl) {
        return res.status(400).json({ error: 'channelName and streamUrl are required' });
    }

    const ffmpegPath = req.app.locals.ffmpegPath || 'ffmpeg';
    const userId = req.user?.id || null;

    try {
        const id = recordingService.startRecording(channelName, streamUrl, userId, ffmpegPath);
        res.json({ id });
    } catch (err) {
        console.error('[Recordings] Start error:', err);
        res.status(500).json({ error: 'Failed to start recording' });
    }
});

// POST /api/recordings/stop/:id
router.post('/stop/:id', (req, res) => {
    const { id } = req.params;
    const stopped = recordingService.stopRecording(id);
    if (!stopped) {
        return res.status(404).json({ error: 'Recording not found or already stopped' });
    }
    res.json({ success: true });
});

// GET /api/recordings
router.get('/', (req, res) => {
    try {
        const list = recordings.getAll().map(r => ({
            ...r,
            isActive: recordingService.isActive(r.id)
        }));
        res.json(list);
    } catch (err) {
        console.error('[Recordings] List error:', err);
        res.status(500).json({ error: 'Failed to list recordings' });
    }
});

// DELETE /api/recordings/:id
router.delete('/:id', (req, res) => {
    const record = recordings.getById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Recording not found' });

    // Stop if active
    if (recordingService.isActive(record.id)) {
        recordingService.stopRecording(record.id);
    }

    // Delete file
    const filePath = path.join(recordingsDir, record.filename);
    try { fs.unlinkSync(filePath); } catch (_) {}

    recordings.delete(record.id);
    res.json({ success: true });
});

module.exports = router;
