/**
 * StreamSlot — self-contained video slot for multiview.
 * Owns one <video> element and one HLS.js instance.
 * Does NOT use the singleton VideoPlayer.
 */
class StreamSlot {
    constructor(index) {
        this.index = index;
        this.channel = null;
        this.hls = null;
        this._focused = false;

        this.el = document.createElement('div');
        this.el.className = 'stream-slot';
        this.el.dataset.slot = index;

        this.el.innerHTML = `
            <video playsinline muted></video>
            <div class="slot-loading hidden"><div class="loading-spinner"></div></div>
            <div class="slot-empty">
                <svg class="slot-empty-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
                </svg>
                <span>Add channel</span>
            </div>
            <div class="slot-error hidden">
                <span class="slot-error-msg"></span>
                <button class="slot-retry-btn">Retry</button>
            </div>
            <div class="slot-label hidden"></div>
            <div class="slot-focus-indicator hidden">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
            </div>
            <button class="slot-change-btn" title="Change channel">Change</button>
        `;

        this.video = this.el.querySelector('video');
        this.loadingEl = this.el.querySelector('.slot-loading');
        this.emptyEl = this.el.querySelector('.slot-empty');
        this.errorEl = this.el.querySelector('.slot-error');
        this.errorMsg = this.el.querySelector('.slot-error-msg');
        this.labelEl = this.el.querySelector('.slot-label');
        this.focusIndicator = this.el.querySelector('.slot-focus-indicator');
        this.changeBtn = this.el.querySelector('.slot-change-btn');

        this.el.querySelector('.slot-retry-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.channel) this.load(this.channel);
        });
    }

    /**
     * Load a channel into this slot.
     * Resolves stream URL internally (xtream vs m3u).
     */
    async load(channel) {
        this.channel = channel;
        this._showLoading();

        try {
            let streamUrl;
            if (channel.sourceType === 'xtream') {
                const streamFormat = window.app?.player?.settings?.streamFormat || 'm3u8';
                const result = await API.proxy.xtream.getStreamUrl(
                    channel.sourceId, channel.streamId, 'live', streamFormat
                );
                streamUrl = result.url;
            } else {
                streamUrl = channel.url;
            }

            // Guard: transcoding not supported in multiview
            if (streamUrl && streamUrl.includes('/api/transcode')) {
                this._showError('Transcoding not supported in multiview');
                return;
            }

            this._playStream(streamUrl, channel.name);
        } catch (err) {
            console.error(`[StreamSlot ${this.index}] Failed to load channel:`, err);
            this._showError('Failed to load channel');
        }
    }

    _playStream(url, label) {
        // Destroy any existing HLS instance
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.video.src = '';
        this.video.load();

        const isHls = url.includes('.m3u8') || url.includes('m3u8');

        if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
            this.hls = new Hls({ maxBufferLength: 20, maxMaxBufferLength: 40, startLevel: -1, enableWorker: true });
            this.hls.loadSource(url);
            this.hls.attachMedia(this.video);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this._hideLoading();
                this._showLabel(label);
                this.video.play().catch(() => {});
            });

            this.hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    this._showError('Stream error — tap to retry');
                }
            });
        } else {
            // Native playback (e.g. native HLS on Safari, or non-HLS)
            this.video.src = url;
            this.video.addEventListener('canplay', () => {
                this._hideLoading();
                this._showLabel(label);
            }, { once: true });
            this.video.addEventListener('error', () => {
                this._showError('Stream error — tap to retry');
            }, { once: true });
            this.video.play().catch(() => {});
        }
    }

    unload() {
        if (this.hls) { this.hls.destroy(); this.hls = null; }
        this.video.pause();
        this.video.src = '';
        this.video.load();
        this.channel = null;
        this._showEmpty();
    }

    focus() {
        this._focused = true;
        this.video.muted = false;
        this.el.classList.add('focused');
        this.focusIndicator.classList.remove('hidden');
    }

    unfocus() {
        this._focused = false;
        this.video.muted = true;
        this.el.classList.remove('focused');
        this.focusIndicator.classList.add('hidden');
    }

    isEmpty() { return this.channel === null; }
    getChannel() { return this.channel; }

    // --- private UI helpers ---

    _showLoading() {
        this.emptyEl.classList.add('hidden');
        this.errorEl.classList.add('hidden');
        this.loadingEl.classList.remove('hidden');
    }

    _hideLoading() {
        this.loadingEl.classList.add('hidden');
    }

    _showEmpty() {
        this.loadingEl.classList.add('hidden');
        this.errorEl.classList.add('hidden');
        this.labelEl.classList.add('hidden');
        this.emptyEl.classList.remove('hidden');
    }

    _showError(msg) {
        this.loadingEl.classList.add('hidden');
        this.emptyEl.classList.add('hidden');
        this.errorMsg.textContent = msg;
        this.errorEl.classList.remove('hidden');
    }

    _showLabel(text) {
        this.labelEl.textContent = text;
        this.labelEl.classList.remove('hidden');
    }
}
