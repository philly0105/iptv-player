/**
 * IPTV Player Application Entry Point
 */

class App {
    constructor() {
        this.currentPage = 'home';
        this.pages = {};
        this.currentUser = null;

        // Initialize components
        this.player = new VideoPlayer();
        this.channelList = new ChannelList();
        this.sourceManager = new SourceManager();
        this.epgGuide = new EpgGuide();

        // Initialize page controllers
        this.pages.home = new HomePage(this);
        this.pages.live = new LivePage(this);
        this.pages.guide = new GuidePage(this);
        this.pages.movies = new MoviesPage(this);
        this.pages.series = new SeriesPage(this);
        this.pages.settings = new SettingsPage(this);
        this.pages.recordings = new RecordingsPage(this);
        this.pages.watch = new WatchPage(this);
        this.pages.multiview = new MultiviewPage(this);

        this.init();
    }

    async init() {
        // Check authentication first
        await this.checkAuth();

        // Mobile bottom tab bar — "More" sheet
        const moreTabBtn = document.getElementById('more-tab-btn');
        const moreSheet = document.getElementById('more-sheet');
        const moreSheetOverlay = document.getElementById('more-sheet-overlay');

        const closeMoreSheet = () => {
            moreSheet?.classList.remove('active');
            moreSheetOverlay?.classList.remove('active');
        };

        moreTabBtn?.addEventListener('click', () => {
            moreSheet?.classList.toggle('active');
            moreSheetOverlay?.classList.toggle('active');
        });

        moreSheetOverlay?.addEventListener('click', closeMoreSheet);

        document.querySelectorAll('.more-sheet-link').forEach(link => {
            link.addEventListener('click', closeMoreSheet);
        });

        // Channel drawer toggle (mobile)
        const channelToggleBtn = document.getElementById('channel-toggle-btn');
        const channelSidebar = document.getElementById('channel-sidebar');
        const channelOverlay = document.getElementById('channel-sidebar-overlay');

        if (channelToggleBtn && channelSidebar && channelOverlay) {
            const toggleChannelDrawer = () => {
                channelSidebar.classList.toggle('active');
                channelOverlay.classList.toggle('active');
            };

            channelToggleBtn.addEventListener('click', toggleChannelDrawer);
            channelOverlay.addEventListener('click', toggleChannelDrawer);

            // Close drawer when a channel is selected
            channelSidebar.addEventListener('click', (e) => {
                if (e.target.closest('.channel-item')) {
                    // Small delay to let the channel selection happen
                    setTimeout(() => {
                        channelSidebar.classList.remove('active');
                        channelOverlay.classList.remove('active');
                    }, 300);
                }
            });
        }

        // Desktop sidebar collapse toggle
        const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
        const sidebarExpandBtn = document.getElementById('sidebar-expand-btn');
        const homeLayout = document.querySelector('.home-layout');

        const toggleSidebarCollapse = () => {
            channelSidebar?.classList.toggle('collapsed');
            homeLayout?.classList.toggle('sidebar-collapsed');

            // Persist preference
            const isCollapsed = channelSidebar?.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
        };

        sidebarCollapseBtn?.addEventListener('click', toggleSidebarCollapse);
        sidebarExpandBtn?.addEventListener('click', toggleSidebarCollapse);

        // Restore sidebar state from localStorage
        if (localStorage.getItem('sidebarCollapsed') === 'true') {
            channelSidebar?.classList.add('collapsed');
            homeLayout?.classList.add('sidebar-collapsed');
        }

        // Navigation handling — rail (desktop), bottom tabs + "More" sheet (mobile)
        document.querySelectorAll('.nav-link, .tab-link[data-page], .more-sheet-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });

        // Now Playing indicator
        const nowPlayingBtn = document.getElementById('now-playing-indicator');
        if (nowPlayingBtn) {
            nowPlayingBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo('watch');
            });
        }

        // Toggle groups button
        document.getElementById('toggle-groups').addEventListener('click', () => {
            this.channelList.toggleAllGroups();
        });

        // Search clear buttons (global handler for all)
        document.querySelectorAll('.search-clear').forEach(btn => {
            btn.addEventListener('click', () => {
                const wrapper = btn.closest('.search-wrapper');
                const input = wrapper?.querySelector('.search-input');
                if (input) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                }
            });
        });

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            const page = e.state?.page || 'home';
            this.navigateTo(page, false); // false = don't add to history
        });

        // Initialize home page first (it's needed for channel list)
        await this.pages.home.init();

        // Preload EPG data in background (non-blocking)
        // This ensures EPG info is available on Live TV page without visiting Guide first
        this.epgGuide.loadEpg().catch(err => {
            console.warn('Background EPG load failed:', err.message);
        });

        // Navigate to the page from URL hash, or default to home
        const hash = window.location.hash.slice(1); // Remove #
        const initialPage = hash && this.pages[hash] ? hash : 'home';
        this.navigateTo(initialPage, true); // true = replace history (don't add)

        console.log('IPTV Player initialized');
    }

    async checkAuth() {
        // Pick up token from URL (autologin redirect or OIDC callback)
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
            localStorage.setItem('authToken', urlToken);
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        }

        // Auto-login from localhost — silently fetch a token if none stored
        if (!localStorage.getItem('authToken')) {
            try {
                const r = await fetch('/api/auth/localtoken');
                if (r.ok) {
                    const { token } = await r.json();
                    localStorage.setItem('authToken', token);
                }
            } catch (_) {}
        }

        const token = localStorage.getItem('authToken');

        if (!token) {
            // No token, redirect to login (replace to avoid back button issues)
            window.location.replace('/login.html');
            return;
        }

        try {
            // Verify token with server
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Invalid token');
            }

            this.currentUser = await response.json();

            // Hide settings for viewers (rail link + "More" sheet link)
            if (this.currentUser.role === 'viewer') {
                document.querySelectorAll('[data-page="settings"]').forEach(link => {
                    link.style.display = 'none';
                });
            }

            // Add logout button to navbar
            this.addLogoutButton();

        } catch (err) {
            console.error('Authentication error:', err);
            localStorage.removeItem('authToken');
            window.location.replace('/login.html');
        }
    }

    addLogoutButton() {
        if (document.getElementById('logout-btn')) return;

        const logoutHandler = async (e) => {
            e.preventDefault();

            const token = localStorage.getItem('authToken');
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            localStorage.removeItem('authToken');
            window.location.replace('/login.html');
        };

        const logoutIconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg>
        `;

        // Rail (desktop)
        const railNavbar = document.querySelector('.nav-sidebar-bottom');
        if (railNavbar) {
            const railLogout = document.createElement('a');
            railLogout.href = '#';
            railLogout.className = 'nav-link';
            railLogout.id = 'logout-btn';
            railLogout.innerHTML = `
                <span class="nav-icon">${logoutIconSvg}</span>
                <span class="nav-link-label">Logout</span>
            `;
            railLogout.addEventListener('click', logoutHandler);
            railNavbar.appendChild(railLogout);
        }

        // "More" sheet (mobile)
        const moreSheet = document.getElementById('more-sheet');
        if (moreSheet) {
            const sheetLogout = document.createElement('a');
            sheetLogout.href = '#';
            sheetLogout.className = 'more-sheet-link';
            sheetLogout.innerHTML = `
                <span class="nav-icon">${logoutIconSvg}</span>
                <span>Logout</span>
            `;
            sheetLogout.addEventListener('click', logoutHandler);
            moreSheet.appendChild(sheetLogout);
        }
    }

    navigateTo(pageName, replaceHistory = false) {
        // Don't navigate if already on this page
        if (this.currentPage === pageName && !replaceHistory) {
            return;
        }

        // Update browser history
        if (replaceHistory) {
            // Replace current history entry (used on initial load)
            history.replaceState({ page: pageName }, '', `#${pageName}`);
        } else {
            // Add new history entry
            history.pushState({ page: pageName }, '', `#${pageName}`);
        }

        // Update nav — rail, bottom tabs, and the "More" sheet all share data-page
        document.querySelectorAll('[data-page]').forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageName);
        });

        // Highlight the "More" tab when the active page lives inside its sheet
        const moreTabBtn = document.getElementById('more-tab-btn');
        moreTabBtn?.classList.toggle('active', ['guide', 'recordings', 'multiview', 'settings'].includes(pageName));

        // Update pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageName}`);
        });

        // Notify page controllers
        if (this.pages[this.currentPage]?.hide) {
            this.pages[this.currentPage].hide();
        }

        this.currentPage = pageName;

        if (this.pages[pageName]?.show) {
            this.pages[pageName].show();
        }
    }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();

    // Fetch and display version badge
    fetch('/api/version')
        .then(res => res.json())
        .then(data => {
            const badge = document.getElementById('version-badge');
            if (badge && data.version) badge.textContent = `v${data.version}`;
        })
        .catch(() => { });
});
