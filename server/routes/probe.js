const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const db = require('../db');
const { safeUrl } = require('../middleware/validate');

/**
 * Probe endpoint - detects stream codecs and container
 * GET /api/probe?url=...
 * 
 * Returns:
 * {
 *   video: "h264",
 *   audio: "aac",
 *   container: "mpegts",
 *   compatible: true,
 *   needsRemux: false,
 *   needsTranscode: false
 * }
 */

// Probe cache (URL → result)
const probeCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (in-memory L1)
// Persistent L2 cache TTL — VOD codecs are static, so this can be long.
const PERSISTENT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Browser-compatible codecs
const BROWSER_VIDEO_CODECS = ['h264', 'avc', 'avc1'];
const BROWSER_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'vorbis'];

/**
 * Probe stream with ffprobe
 */
function probeStream(url, ffprobePath, userAgent = null, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-user_agent', userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            // Trimmed from 5MB/5s: standard VOD codecs are identifiable in far less,
            // and a slow HTTP provider makes the pre-roll download the dominant
            // time-to-first-frame cost. Result is cached (L1 5min / L2 7 days) anyway.
            '-probesize', '1500000',
            '-analyzeduration', '2000000',
            url
        ];

        const proc = spawn(ffprobePath, args);
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('Probe timeout'));
        }, timeout);

        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                reject(new Error('Failed to parse ffprobe output'));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * Analyze probe result and determine compatibility
 */
function analyzeProbeResult(probeResult, url) {
    const streams = probeResult.streams || [];
    const format = probeResult.format || {};

    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio');

    const videoCodec = videoStream?.codec_name?.toLowerCase() || 'unknown';
    const audioCodec = audioStream?.codec_name?.toLowerCase() || 'unknown';
    const container = format.format_name?.toLowerCase() || 'unknown';

    // Check codec compatibility — browsers only decode stereo (or mono) audio reliably
    const audioChannels = audioStream?.channels || 0;
    const videoOk = BROWSER_VIDEO_CODECS.some(c => videoCodec.includes(c));
    const audioOk = BROWSER_AUDIO_CODECS.some(c => audioCodec.includes(c))
        && (audioChannels <= 2 || audioChannels === 0);

    // Browser-safe containers
    // Note: We exclude 'webm' because ffprobe reports MKV as "matroska,webm", 
    // and H.264/AAC in MKV/WebM is not universally supported. Best to remux to MP4.
    const BROWSER_CONTAINERS = ['hls', 'mp4', 'mov'];
    const containerOk = BROWSER_CONTAINERS.some(c => container.includes(c));

    // Check if it's a raw TS stream (not HLS)
    const isRawTs = (container.includes('mpegts') || url.endsWith('.ts')) && !url.includes('.m3u8');

    // Extract subtitle tracks
    const subtitles = streams
        .filter(s => s.codec_type === 'subtitle' && s.codec_name !== 'timed_id3' && s.codec_name !== 'bin_data')
        .map(s => ({
            index: s.index,
            language: s.tags?.language || 'und',
            title: s.tags?.title || s.tags?.language || `Track ${s.index}`,
            codec: s.codec_name
        }));

    // Determine what processing is needed
    // 4. MKV files often cause OOM/decoding issues in browser fMP4 remux, 
    // so we force them to "needsTranscode" which uses HLS (more robust).
    // The frontend will still use "copy" mode if codecs are compatible.
    const isMkv = container.includes('matroska') || container.includes('webm') || url.endsWith('.mkv');

    // 1. Incompatible audio/video OR MKV -> Transcode (or HLS Copy)
    const needsTranscode = !audioOk || !videoOk || isMkv;

    // 2. Compatible audio/video but incompatible container (non-MKV) -> Remux (fMP4 pipe)
    const needsRemux = !needsTranscode && (!containerOk || isRawTs);

    const compatible = !needsTranscode && !needsRemux;

    return {
        video: videoCodec,
        audio: audioCodec,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        audioChannels: audioStream?.channels || 0, // For Smart Audio Copy
        container: container,
        compatible: compatible,
        needsRemux: needsRemux,
        needsTranscode: needsTranscode,
        subtitles: subtitles
    };
}

router.get('/', safeUrl('url'), async (req, res) => {
    const { url, ua } = req.query;

    const ffprobePath = req.app.locals.ffprobePath;
    // v2: multi-channel audio (>2ch) is no longer marked browser-compatible
    const cacheKey = `v2|${url}${ua ? `|${ua}` : ''}`;

    if (!ffprobePath) {
        // No ffprobe available - assume needs transcoding to be safe
        console.log('[Probe] FFprobe not available, assuming transcode needed');
        return res.json({
            video: 'unknown',
            audio: 'unknown',
            container: 'unknown',
            compatible: false,
            needsRemux: false,
            needsTranscode: true
        });
    }

    // Check in-memory cache (L1)
    const cached = probeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`[Probe] Cache hit (memory) for: ${url.substring(0, 50)}...`);
        return res.json(cached.result);
    }

    // Check persistent cache (L2) — survives restarts and replays beyond L1 TTL
    try {
        const persisted = db.probeCache.get(cacheKey, PERSISTENT_CACHE_TTL);
        if (persisted) {
            console.log(`[Probe] Cache hit (persistent) for: ${url.substring(0, 50)}...`);
            probeCache.set(cacheKey, { result: persisted, timestamp: Date.now() });
            return res.json(persisted);
        }
    } catch (err) {
        console.warn('[Probe] Persistent cache read failed:', err.message);
    }

    console.log(`[Probe] Probing: ${url.substring(0, 80)}... ${ua ? `(UA: ${ua})` : ''}`);

    try {
        const resolvedUa = db.USER_AGENT_PRESETS[ua] || ua;
        const probeResult = await probeStream(url, ffprobePath, resolvedUa);
        const analysis = analyzeProbeResult(probeResult, url);

        // Cache result (L1 memory + L2 persistent)
        probeCache.set(cacheKey, { result: analysis, timestamp: Date.now() });
        try {
            db.probeCache.set(cacheKey, analysis);
        } catch (err) {
            console.warn('[Probe] Persistent cache write failed:', err.message);
        }

        console.log(`[Probe] Result: video=${analysis.video}, audio=${analysis.audio}, ` +
            `container=${analysis.container}, compatible=${analysis.compatible}, ` +
            `needsRemux=${analysis.needsRemux}, needsTranscode=${analysis.needsTranscode}`);

        res.json(analysis);
    } catch (err) {
        console.error('[Probe] Failed:', err.message);

        // On error, assume transcode needed to be safe
        res.json({
            video: 'unknown',
            audio: 'unknown',
            container: 'unknown',
            compatible: false,
            needsRemux: false,
            needsTranscode: true,
            error: err.message
        });
    }
});

module.exports = router;
