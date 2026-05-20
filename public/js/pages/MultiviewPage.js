/**
 * MultiviewPage — watch up to 4 live TV channels simultaneously.
 * Manages 4 StreamSlot instances, layout switching, audio focus,
 * and a channel picker overlay.
 */
class MultiviewPage {
    constructor(app) {
        this.app = app;
        this.slots = [];
        this.focusedSlot = 0;
        this.layout = 'grid';
        this.pickerSlot = null;
        this.pendingChannel = null;
        this._allChannels = []; // Cache for picker

        this.grid = document.getElementById('multiview-grid');
        this.pickerEl = document.getElementById('multiview-picker');
        this.pickerSearch = document.getElementById('multiview-picker-search');
        this.pickerList = document.getElementById('multiview-picker-list');
        this.pickerClose = document.getElementById('multiview-picker-close');

        this._initSlots();
        this._initLayoutBtns();
        this._initPickerEvents();
    }

    _initSlots() {
        for (let i = 0; i < 4; i++) {
            const slot = new StreamSlot(i);
            this.slots.push(slot);
            this.grid.appendChild(slot.el);

            // Click on slot body → focus audio or open picker
            slot.el.addEventListener('click', (e) => {
                if (e.target.closest('.slot-change-btn')) {
                    e.stopPropagation();
                    this.openPicker(i);
                    return;
                }
                if (slot.isEmpty()) {
                    this.openPicker(i);
                    return;
                }
                this.focusSlot(i);
            });

            // Mute all slots initially
            slot.video.muted = true;
        }
        // Give slot 0 audio focus on init
        this.slots[0].focus();
    }

    _initLayoutBtns() {
        const container = document.getElementById('page-multiview');
        const btns = container ? container.querySelectorAll('.multiview-layout-btn') : [];
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setLayout(btn.dataset.layout);
            });
        });
    }

    _initPickerEvents() {
        this.pickerClose?.addEventListener('click', () => this.closePicker());

        // Click outside panel closes picker
        this.pickerEl?.addEventListener('click', (e) => {
            if (e.target === this.pickerEl) this.closePicker();
        });

        // Escape key closes picker
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.pickerEl?.classList.contains('hidden')) {
                this.closePicker();
            }
        });

        // Search filter
        this.pickerSearch?.addEventListener('input', () => {
            this._renderPickerList(this.pickerSearch.value.trim());
        });
    }

    /** Called by router when navigating to this page */
    show() {
        if (this.pendingChannel) {
            const targetSlot = this.slots.findIndex(s => s.isEmpty());
            const index = targetSlot === -1 ? 0 : targetSlot;
            this.slots[index].load(this.pendingChannel);
            this.pendingChannel = null;
        }
        this.focusSlot(this.focusedSlot);
    }

    /** Called by router when navigating away */
    hide() {
        this.slots.forEach(s => s.unload());
        this.closePicker();
    }

    /**
     * Queue a channel to be loaded on next page show.
     * Called from ChannelList before navigating here.
     */
    queueChannel(channel) {
        this.pendingChannel = channel;
    }

    focusSlot(index) {
        this.slots[this.focusedSlot].unfocus();
        this.focusedSlot = index;
        this.slots[index].focus();
    }

    setLayout(layout) {
        this.layout = layout;
        this.grid.classList.remove('layout-grid', 'layout-focus');
        this.grid.classList.add(`layout-${layout}`);
    }

    openPicker(slotIndex) {
        this.pickerSlot = slotIndex;
        this.pickerSearch.value = '';
        this._loadPickerChannels().then(() => {
            this._renderPickerList('');
        });
        this.pickerEl.classList.remove('hidden');
        this.pickerSearch.focus();
    }

    closePicker() {
        this.pickerEl?.classList.add('hidden');
        this.pickerSlot = null;
    }

    async _loadPickerChannels() {
        // Prefer ChannelList's already-loaded data so multiview mirrors the Live TV tab exactly.
        // ChannelList.channels is populated whenever the user has visited Live TV.
        const loaded = this.app.channelList?.channels;
        if (loaded && loaded.length > 0) {
            this._allChannels = loaded;
            return;
        }

        // Fallback: fetch directly from each enabled source.
        // Both xtream and m3u sources use the same Xtream-compatible proxy endpoints
        // (the backend normalises them), so we use API.proxy.xtream for both.
        try {
            const sources = await API.sources.getAll();
            const channels = [];
            for (const source of sources) {
                if (!source.enabled) continue;
                if (source.type !== 'xtream' && source.type !== 'm3u') continue;
                try {
                    const streams = await API.proxy.xtream.liveStreams(source.id);
                    streams.forEach(s => channels.push({
                        id: `${source.type}_${source.id}_${s.stream_id}`,
                        streamId: s.stream_id,
                        name: s.name,
                        tvgLogo: s.stream_icon,
                        sourceId: source.id,
                        sourceType: source.type,
                        url: s.stream_url || null,
                    }));
                } catch (sourceErr) {
                    console.warn(`[MultiviewPage] Failed to load source ${source.id}:`, sourceErr.message);
                }
            }
            this._allChannels = channels;
        } catch (err) {
            console.error('[MultiviewPage] Failed to load channels for picker:', err);
            this._allChannels = [];
        }
    }

    _renderPickerList(query) {
        const q = query.toLowerCase();
        const filtered = q
            ? this._allChannels.filter(c =>
                c.name.toLowerCase().includes(q) ||
                (c.url && c.url.toLowerCase().includes(q)))
            : this._allChannels;

        if (filtered.length === 0) {
            this.pickerList.innerHTML = '<p style="padding:12px;color:var(--color-text-secondary);font-size:0.875rem;text-align:center">No channels found</p>';
            return;
        }

        this.pickerList.innerHTML = filtered.slice(0, 2000).map(ch => `
            <div class="picker-channel-item" data-channel-id="${ch.id}">
                <img class="picker-channel-logo"
                     src="${ch.tvgLogo ? '/api/proxy/image?url=' + encodeURIComponent(ch.tvgLogo) : '/img/placeholder.png'}"
                     alt="" onerror="this.src='/img/placeholder.png'">
                <span class="picker-channel-name">${this._escapeHtml(ch.name)}</span>
            </div>
        `).join('');

        this.pickerList.querySelectorAll('.picker-channel-item').forEach(item => {
            item.addEventListener('click', () => {
                const channel = this._allChannels.find(c => c.id === item.dataset.channelId);
                if (channel && this.pickerSlot !== null) {
                    this.slots[this.pickerSlot].load(channel);
                    this.closePicker();
                }
            });
        });
    }

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
