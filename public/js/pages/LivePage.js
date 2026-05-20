class LivePage {
    constructor(app) {
        this.app = app;
        this.handleKeydown = this.handleKeydown.bind(this);
        this.activeRecordingId = null;
        this.recordTimerInterval = null;
        this.recordStartTime = null;
    }

    async init() {
        await this.app.channelList.loadSources();
        await this.app.channelList.loadChannels();

        try {
            await this.app.epgGuide.fetchEpgData();
            this.app.channelList.clearProgramInfoCache();
            this.updateProgramInfo();
        } catch (err) {
            console.warn('Background EPG fetch failed:', err);
        }

        this.initRecordButton();
    }

    initRecordButton() {
        const btn = document.getElementById('btn-record');
        if (!btn) return;
        btn.addEventListener('click', () => this.toggleRecording());
    }

    async toggleRecording() {
        if (this.activeRecordingId) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        const channel = this.app.player?.currentChannel;
        if (!channel) return;

        const streamUrl = this.app.player.originalStreamUrl || channel.url || channel.stream_url;
        if (!streamUrl) return;

        try {
            const result = await API.recordings.start(channel.name, streamUrl);
            this.activeRecordingId = result.id;
            this.recordStartTime = Date.now();
            this.updateRecordButton();
            this.recordTimerInterval = setInterval(() => this.updateRecordButton(), 1000);
        } catch (err) {
            console.error('[Recording] Start failed:', err);
        }
    }

    async stopRecording() {
        if (!this.activeRecordingId) return;
        try {
            await API.recordings.stop(this.activeRecordingId);
        } catch (err) {
            console.error('[Recording] Stop failed:', err);
        }
        this.activeRecordingId = null;
        this.recordStartTime = null;
        clearInterval(this.recordTimerInterval);
        this.recordTimerInterval = null;
        this.updateRecordButton();
    }

    updateRecordButton() {
        const btn = document.getElementById('btn-record');
        if (!btn) return;

        if (this.activeRecordingId && this.recordStartTime) {
            const elapsed = Date.now() - this.recordStartTime;
            const s = Math.floor(elapsed / 1000);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            const timer = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            btn.title = `Stop Recording (${timer})`;
            btn.style.color = '#ef4444';
            btn.classList.add('recording-active');
        } else {
            btn.title = 'Record';
            btn.style.color = '';
            btn.classList.remove('recording-active');
        }
    }

    updateProgramInfo() {
        const channelItems = Array.from(document.querySelectorAll('.channel-item'));
        if (channelItems.length === 0) return;

        const channelMap = new Map();
        this.app.channelList.channels.forEach(c => channelMap.set(c.id, c));

        const BATCH_SIZE = 50;
        let index = 0;

        const processBatch = () => {
            const end = Math.min(index + BATCH_SIZE, channelItems.length);
            for (let i = index; i < end; i++) {
                const item = channelItems[i];
                const channelId = item.dataset.channelId;
                const channel = channelMap.get(channelId);
                if (channel) {
                    const programDiv = item.querySelector('.channel-program');
                    if (programDiv) {
                        programDiv.textContent = this.app.channelList.getProgramInfo(channel) || '';
                    }
                }
            }
            index = end;
            if (index < channelItems.length) requestAnimationFrame(processBatch);
        };

        requestAnimationFrame(processBatch);
    }

    handleKeydown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.key) {
            case 'ArrowUp':
                if (this.app.player && !this.app.player.settings.arrowKeysChangeChannel) return;
                e.preventDefault();
                this.app.channelList.selectPrevChannel();
                break;
            case 'ArrowDown':
                if (this.app.player && !this.app.player.settings.arrowKeysChangeChannel) return;
                e.preventDefault();
                this.app.channelList.selectNextChannel();
                break;
        }
    }

    async show() {
        document.addEventListener('keydown', this.handleKeydown);
        if (!this._recordBtnWired) {
            this.initRecordButton();
            this._recordBtnWired = true;
        }
        if (this.app.channelList.channels.length === 0) {
            await this.app.channelList.loadSources();
            await this.app.channelList.loadChannels();
        }
    }

    hide() {
        document.removeEventListener('keydown', this.handleKeydown);
    }
}

window.LivePage = LivePage;