const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { recordings } = require('../db/sqlite');

const recordingsDir = path.join(__dirname, '..', '..', 'data', 'recordings');

// Ensure recordings directory exists
if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
}

// In-memory map of active FFmpeg processes: id -> { process, filename, outputPath }
const active = new Map();

function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

function startRecording(channelName, streamUrl, userId, ffmpegPath) {
    const id = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const filename = `${timestamp}-${sanitizeName(channelName)}.ts`;
    const outputPath = path.join(recordingsDir, filename);

    const args = [
        '-hide_banner', '-loglevel', 'warning',
        '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-fflags', '+genpts+discardcorrupt+nobuffer',
        '-err_detect', 'ignore_err',
        '-i', streamUrl,
        '-map', '0:v', '-map', '0:a',
        '-c', 'copy',
        '-f', 'mpegts',
        outputPath
    ];

    const ffmpeg = spawn(ffmpegPath || 'ffmpeg', args);

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('error') || msg.includes('Error')) {
            console.warn(`[Recording ${id}] FFmpeg: ${msg.trim()}`);
        }
    });

    ffmpeg.on('exit', (code) => {
        if (active.has(id)) {
            // Unexpected exit
            console.warn(`[Recording ${id}] FFmpeg exited with code ${code}`);
            active.delete(id);
            try {
                const stat = fs.statSync(outputPath);
                recordings.markDone(id, stat.size);
            } catch (_) {
                recordings.markError(id, `FFmpeg exited with code ${code}`);
            }
        }
    });

    ffmpeg.on('error', (err) => {
        console.error(`[Recording ${id}] Spawn error:`, err.message);
        active.delete(id);
        recordings.markError(id, err.message);
    });

    recordings.insert(id, userId, channelName, filename);
    active.set(id, { process: ffmpeg, filename, outputPath });

    console.log(`[Recording] Started: ${filename}`);
    return id;
}

function stopRecording(id) {
    const entry = active.get(id);
    if (!entry) return false;

    entry.process.kill('SIGTERM');
    setTimeout(() => {
        try { entry.process.kill('SIGKILL'); } catch (_) {}
    }, 3000);

    active.delete(id);

    try {
        const stat = fs.statSync(entry.outputPath);
        recordings.markDone(id, stat.size);
    } catch (_) {
        recordings.markDone(id, 0);
    }

    console.log(`[Recording] Stopped: ${entry.filename}`);
    return true;
}

function isActive(id) {
    return active.has(id);
}

function cleanupInterrupted() {
    recordings.markInterruptedAsError();
}

module.exports = { startRecording, stopRecording, isActive, cleanupInterrupted };
