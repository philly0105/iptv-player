class RecordingsPage {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('recordings-list');
        this.recordings = [];
        this.timerInterval = null;
    }

    async show() {
        await this.load();
        this.startTimer();
    }

    hide() {
        this.stopTimer();
    }

    startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => this.updateActiveTimers(), 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async load() {
        try {
            this.recordings = await API.recordings.list();
            this.render();
        } catch (err) {
            this.container.innerHTML = `<p class="hint">Failed to load recordings: ${err.message}</p>`;
        }
    }

    render() {
        if (!this.recordings.length) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <p>No recordings yet</p>
                    <p class="hint">Hit the record button while watching Live TV</p>
                </div>`;
            return;
        }

        this.container.innerHTML = this.recordings.map(r => this.renderRow(r)).join('');

        this.container.querySelectorAll('[data-action="stop"]').forEach(btn => {
            btn.addEventListener('click', () => this.stopRecording(btn.dataset.id));
        });
        this.container.querySelectorAll('[data-action="download"]').forEach(btn => {
            btn.addEventListener('click', () => this.downloadRecording(btn.dataset.id));
        });
        this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => this.deleteRecording(btn.dataset.id));
        });
    }

    renderRow(r) {
        const date = new Date(r.started_at).toLocaleString();
        const size = r.file_size ? this.formatSize(r.file_size) : '—';
        const duration = r.stopped_at
            ? this.formatDuration(r.stopped_at - r.started_at)
            : r.isActive
                ? `<span class="recording-timer" data-started="${r.started_at}">${this.formatDuration(Date.now() - r.started_at)}</span>`
                : '—';

        const statusBadge = r.isActive
            ? '<span style="color:#ef4444;">● REC</span>'
            : r.status === 'done'
                ? '<span style="color:#22c55e;">Done</span>'
                : '<span style="color:#f59e0b;">Error</span>';

        const actions = r.isActive
            ? `<button class="btn btn-sm btn-ghost" data-action="stop" data-id="${r.id}">Stop</button>`
            : r.status === 'done'
                ? `<button class="btn btn-sm btn-ghost" data-action="download" data-id="${r.id}">Download</button>
                   <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${r.id}">Delete</button>`
                : `<button class="btn btn-sm btn-ghost" data-action="delete" data-id="${r.id}">Delete</button>`;

        return `
            <div class="recording-row" style="display:flex; align-items:center; gap:var(--space-md); padding:var(--space-md) 0; border-bottom:1px solid var(--color-border);">
                <div style="flex:1;">
                    <div style="font-weight:500;">${r.channel_name}</div>
                    <div class="hint">${date} · ${duration} · ${size}</div>
                </div>
                <div>${statusBadge}</div>
                <div style="display:flex; gap:var(--space-sm);">${actions}</div>
            </div>`;
    }

    updateActiveTimers() {
        this.container.querySelectorAll('.recording-timer').forEach(el => {
            const started = parseInt(el.dataset.started);
            el.textContent = this.formatDuration(Date.now() - started);
        });
    }

    async stopRecording(id) {
        try {
            await API.recordings.stop(id);
            await this.load();
        } catch (err) {
            alert('Failed to stop recording: ' + err.message);
        }
    }

    downloadRecording(id) {
        window.location.href = API.recordings.download(id);
    }

    async deleteRecording(id) {
        if (!confirm('Delete this recording?')) return;
        try {
            await API.recordings.delete(id);
            await this.load();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    }

    formatDuration(ms) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    formatSize(bytes) {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}

window.RecordingsPage = RecordingsPage;
