const express = require('express');
require('dotenv').config();
const path = require('path');
const passport = require('passport');
const syncService = require('./services/syncService');
const { apiLimiter } = require('./middleware/rateLimiter');

// Initialize database
require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust only the immediate upstream proxy (one hop).
// 'true' would trust every X-Forwarded-For entry which can be spoofed.
app.set('trust proxy', 1);

// Baseline security headers (lightweight, no external dependency).
// CSP is intentionally omitted — the local auto-login flow returns an inline
// <script>, which a strict script-src would block.
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '0');
    next();
});

// Body parsing — 1 MB cap prevents request-smuggling via oversized payloads.
// The previous 50 MB limit was unnecessary for this API's use cases.
app.use(express.json({ limit: '1mb' }));

// Initialize Passport
const session = require('express-session');
// SESSION_SECRET must be a separate secret from JWT_SECRET (different purpose, different rotation schedule).
const sessionSecret = process.env.SESSION_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET environment variable is required in production');
    }
    console.warn('[security] SESSION_SECRET not set — using insecure dev default. Set SESSION_SECRET in .env before deploying.');
    return 'iptv-player-dev-session-secret-DO-NOT-USE-IN-PRODUCTION';
})();
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false, // Don't create sessions until something is stored
    cookie: { httpOnly: true, sameSite: 'lax' }
}));
app.use(passport.initialize());
app.use(passport.session());

// Global rate limiter — applied to all /api routes.
// Individual sensitive routes apply stricter per-route limiters on top of this.
app.use('/api', apiLimiter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// FFMPEG Configuration (optional - for transcoding support)
// Priority: 1. System FFmpeg (better Docker DNS support), 2. ffmpeg-static npm package
const { execSync } = require('child_process');

function findFFmpeg() {
    // Try system FFmpeg first (better Docker compatibility)
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('FFmpeg binary configured at: ffmpeg (system)');
        return 'ffmpeg';
    } catch (e) {
        // System FFmpeg not found, try ffmpeg-static
    }

    // Try ffmpeg-static npm package
    try {
        let ffmpegPath = require('ffmpeg-static');
        // In packaged Electron apps, ffmpeg-static returns path inside .asar archive
        // but the binary is actually unpacked to app.asar.unpacked
        if (ffmpegPath && ffmpegPath.includes('app.asar')) {
            ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
        }
        console.log('FFmpeg binary configured at:', ffmpegPath);
        return ffmpegPath;
    } catch (err) {
        console.warn('FFmpeg not available - transcoding/remuxing will be disabled.');
        console.warn('Install FFmpeg via your package manager or npm install ffmpeg-static');
        return null;
    }
}

function findFFprobe() {
    // Try system ffprobe first
    try {
        execSync('ffprobe -version', { stdio: 'ignore' });
        console.log('FFprobe binary configured at: ffprobe (system)');
        return 'ffprobe';
    } catch (e) {
        // Not found in system
    }

    // Try @ffprobe-installer/ffprobe package
    try {
        const ffprobePath = require('@ffprobe-installer/ffprobe').path;
        if (ffprobePath) {
            console.log('FFprobe binary configured at:', ffprobePath);
            return ffprobePath;
        }
    } catch (err) {
        // Package not available
    }

    console.warn('FFprobe not available - auto transcode will fallback to always transcode');
    return null;
}

app.locals.ffmpegPath = findFFmpeg();
app.locals.ffprobePath = findFFprobe();

// Mark any recordings that were in-progress when server last stopped as error
try {
    const { cleanupInterrupted } = require('./services/recordingService');
    cleanupInterrupted();
} catch (_) {}

// Dynamic services loader - collects exports from files in ./services
const fs = require('fs');
const services = {};
try {
    const servicesDir = path.join(__dirname, 'services');
    const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
    for (const file of serviceFiles) {
        const name = file.replace(/\.js$/, '');
        try {
            services[name] = require(path.join(servicesDir, file));
        } catch (e) {
            console.warn(`Failed to load service ${file}:`, e.message);
        }
    }
} catch (e) {
    console.warn('No services directory found or failed to read services:', e.message);
}

// Freeze services object to prevent plugins from mutating shared state
Object.freeze(services);

// Plugin loader: loads any .js file inside server/plugins and calls the
// exported function with (app, services).
// Supports both function exports and object exports with lifecycle hooks.
const loadedPlugins = [];

async function loadPlugins() {
    try {
        const pluginsDir = path.join(__dirname, 'plugins');
        if (fs.existsSync(pluginsDir)) {
            // Sort plugin files alphabetically for deterministic load order
            const pluginFiles = fs.readdirSync(pluginsDir)
                .filter(f => f.endsWith('.js'))
                .sort();

            for (const file of pluginFiles) {
                const pluginPath = path.join(pluginsDir, file);
                try {
                    const plugin = require(pluginPath);

                    // Support both function exports and object exports with lifecycle hooks
                    if (typeof plugin === 'function') {
                        // Direct function export (sync or async)
                        await plugin(app, services);
                        loadedPlugins.push({ name: file, plugin: null });
                        console.log(`✓ Loaded plugin: ${file}`);
                    } else if (plugin && typeof plugin.init === 'function') {
                        // Object export with init/shutdown lifecycle
                        await plugin.init(app, services);
                        loadedPlugins.push({ name: file, plugin });
                        console.log(`✓ Loaded plugin: ${file} (with lifecycle hooks)`);
                    } else {
                        console.warn(`⚠ Plugin ${file} does not export a function or object with init(), skipping.`);
                    }
                } catch (err) {
                    console.error(`✗ Failed to load plugin ${file}:`, err);
                }
            }
        }
    } catch (err) {
        console.warn('Plugin loader failed:', err.message);
    }
}

// Graceful shutdown handler for plugins with shutdown hooks
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down plugins...');
    for (const { name, plugin } of loadedPlugins) {
        if (plugin && typeof plugin.shutdown === 'function') {
            try {
                await plugin.shutdown();
                console.log(`✓ Shutdown plugin: ${name}`);
            } catch (err) {
                console.error(`✗ Error shutting down plugin ${name}:`, err);
            }
        }
    }
    process.exit(0);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sources', require('./routes/sources'));
app.use('/api/proxy', require('./routes/proxy'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/transcode', require('./routes/transcode'));
app.use('/api/remux', require('./routes/remux'));
app.use('/api/probe', require('./routes/probe'));
app.use('/api/subtitle', require('./routes/subtitle'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/history', require('./routes/history'));
app.use('/api/recordings', require('./routes/recordings'));

// Version endpoint
app.get('/api/version', (req, res) => {
    const pkg = require('../package.json');
    res.json({ version: pkg.version });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Seed default sources if they don't already exist.
async function seedDefaultSource() {
    try {
        const db = require('./db');
        const existing = await db.sources.getAll();

        // 1. Seed Free Global IPTV if not present
        const hasGlobalIptv = existing.some(s => s.url === 'https://iptv-org.github.io/iptv/index.m3u');
        if (!hasGlobalIptv) {
            await db.sources.create({
                name: 'Free Global IPTV (iptv-org)',
                type: 'm3u',
                url: 'https://iptv-org.github.io/iptv/index.m3u',
            });
            console.log('✓ Free Global IPTV source added');
        }

        // 2. Seed default Xtream source if database has no sources and env vars are set
        if (existing.length === 0) {
            const host = process.env.IPTV_DEFAULT_HOST;
            const username = process.env.IPTV_DEFAULT_USER;
            const password = process.env.IPTV_DEFAULT_PASS;
            if (host && username && password) {
                await db.sources.create({
                    name: process.env.IPTV_DEFAULT_NAME || 'My IPTV',
                    type: 'xtream',
                    url: host,
                    username,
                    password,
                });
                console.log('✓ Default Xtream IPTV source added');
            }
        }
    } catch (err) {
        console.warn('Could not seed default sources:', err.message);
    }
}

app.listen(PORT, async () => {
    console.log(`IPTV Player server running on http://localhost:${PORT}`);

    // Load plugins
    await loadPlugins().catch(err => {
        console.error('Plugin initialization failed:', err);
    });

    // Seed default source then sync
    await seedDefaultSource();

    // Trigger background sync with delay to allow server to settle
    setTimeout(async () => {
        await syncService.syncAll().catch(console.error);
        // Start the server-side sync timer after initial sync
        await syncService.startSyncTimer().catch(console.error);

        // Detect hardware acceleration capabilities
        try {
            const hwDetect = require('./services/hwDetect');
            await hwDetect.detect();
        } catch (err) {
            console.warn('Hardware detection failed:', err.message);
        }
    }, 5000);
});
