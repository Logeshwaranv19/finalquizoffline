// OffGridLink - CouchDB Sync Module
// Syncs all 3 databases when internet / CouchDB is available

document.addEventListener('DOMContentLoaded', () => {
    const syncStatusEl = document.getElementById('sync-status');
    if (!syncStatusEl) return;

    const LOCALHOST_IP = 'localhost';

    const syncIndicator = syncStatusEl.querySelector('span:first-child');
    const syncText = syncStatusEl.querySelector('span:last-child');

    let syncHandlers = [];
    let currentBaseUrl = '';

    // Load saved config
    const defaultIP = LOCALHOST_IP;
    const defaultPort = localStorage.getItem('offgrid-couch-port') || '5984';
    const defaultUser = localStorage.getItem('offgrid-couch-user') || 'admin';
    const defaultPass = localStorage.getItem('offgrid-couch-pass') || 'admin';

    // Keep host fixed to localhost for auto-fetch/local sync mode.
    localStorage.setItem('offgrid-couch-ip', LOCALHOST_IP);

    // Persist credential defaults on first run
    if (!localStorage.getItem('offgrid-couch-user')) localStorage.setItem('offgrid-couch-user', defaultUser);
    if (!localStorage.getItem('offgrid-couch-pass')) localStorage.setItem('offgrid-couch-pass', defaultPass);

    function tryInitialSync() {
        try {
            startAllSync(defaultIP, defaultPort, defaultUser, defaultPass);
        } catch (err) {
            console.error('[Sync] Initial auto-sync failed:', err);
            updateSyncUI('offline');
        }
    }

    // ─── Settings UI ────────────────────────────────────────
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsIpInput = document.getElementById('settings-ip');
    const settingsPortInput = document.getElementById('settings-port');
    const settingsUserInput = document.getElementById('settings-user');
    const settingsPassInput = document.getElementById('settings-pass');
    const testConnBtn = document.getElementById('test-conn-btn');

    function openSettings() {
        settingsIpInput.value = localStorage.getItem('offgrid-couch-ip') || LOCALHOST_IP;
        settingsIpInput.readOnly = false;
        settingsPortInput.value = localStorage.getItem('offgrid-couch-port') || '5984';
        if (settingsUserInput) settingsUserInput.value = localStorage.getItem('offgrid-couch-user') || 'admin';
        if (settingsPassInput) settingsPassInput.value = localStorage.getItem('offgrid-couch-pass') || 'admin';
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    function saveSettings() {
        const ip = settingsIpInput.value.trim() || LOCALHOST_IP;
        const port = settingsPortInput.value.trim() || '5984';
        const user = settingsUserInput ? settingsUserInput.value.trim() : 'admin';
        const pass = settingsPassInput ? settingsPassInput.value.trim() : '';

        localStorage.setItem('offgrid-couch-ip', ip);
        localStorage.setItem('offgrid-couch-port', port);
        localStorage.setItem('offgrid-couch-user', user);
        localStorage.setItem('offgrid-couch-pass', pass);

        try {
            startAllSync(ip, port, user, pass);
        } catch (err) {
            console.error('[Sync] Save & Connect failed:', err);
            updateSyncUI('offline');
            alert('Save completed, but connection failed. Please check CouchDB status and try again.');
            return;
        }
        closeSettings();
    }

    const closeSettingsBtn2 = document.getElementById('close-settings-btn-2');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
    if (closeSettingsBtn2) closeSettingsBtn2.addEventListener('click', closeSettings);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    if (settingsModal) {
        settingsModal.addEventListener('click', e => {
            if (e.target === settingsModal) closeSettings();
        });
    }
    if (syncStatusEl) {
        syncStatusEl.style.cursor = 'pointer';
        syncStatusEl.addEventListener('click', openSettings);
    }

    // Test connection button
    if (testConnBtn) {
        testConnBtn.addEventListener('click', async () => {
            const ip = settingsIpInput.value.trim() || LOCALHOST_IP;
            const port = settingsPortInput.value.trim() || '5984';
            const user = settingsUserInput ? settingsUserInput.value.trim() : '';
            const pass = settingsPassInput ? settingsPassInput.value.trim() : '';
            const url = `http://${ip}:${port}`;
            testConnBtn.textContent = 'Testing...';
            try {
                const resp = await fetch(url, { method: 'GET' });
                // 200 = open, 401 = auth required — both mean CouchDB is reachable
                if (resp.ok || resp.status === 401) {
                    testConnBtn.textContent = '✓ Connected!';
                } else {
                    testConnBtn.textContent = '❌ Failed (' + resp.status + ')';
                }
            } catch (e) {
                testConnBtn.textContent = '❌ No Connection';
            }
            setTimeout(() => { testConnBtn.textContent = 'Test Connection'; }, 3000);
        });
    }

    // ─── Sync Logic ─────────────────────────────────────────
    function buildBaseUrl(ip, port, user, pass) {
        if (user && pass) {
            return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}`;
        }
        return `http://${ip}:${port}`;
    }

    function startAllSync(ip, port, user, pass) {
        if (!window.quizzesDB || !window.submissionsDB || !window.resultsDB) {
            throw new Error('Local databases are not initialized yet.');
        }

        // Cancel existing sync handlers
        syncHandlers.forEach(h => { try { h.cancel(); } catch (e) { } });
        syncHandlers = [];

        currentBaseUrl = buildBaseUrl(ip, port, user, pass);
        updateSyncUI('syncing');

        const databases = [
            { local: window.quizzesDB, name: 'offgrid_quizzes' },
            { local: window.submissionsDB, name: 'offgrid_submissions' },
            { local: window.resultsDB, name: 'offgrid_results' }
        ];

        let activeCount = 0;
        let errorCount = 0;

        databases.forEach(({ local, name }) => {
            const remoteUrl = `${currentBaseUrl}/${name}`;
            console.log(`[Sync] Starting sync: ${name}`);

            const handler = local.sync(remoteUrl, {
                live: true,
                retry: true
            }).on('change', info => {
                console.log(`[Sync] ${name} change:`, info.direction);
                window.dispatchEvent(new CustomEvent('db-changed', { detail: { db: name } }));
                if (errorCount === 0) updateSyncUI('active');
            }).on('paused', err => {
                if (err) {
                    errorCount++;
                    console.warn(`[Sync] ${name} paused with error:`, err);
                    if (errorCount >= databases.length) updateSyncUI('offline');
                } else {
                    activeCount++;
                    if (activeCount >= databases.length) updateSyncUI('online');
                }
            }).on('active', () => {
                updateSyncUI('syncing');
            }).on('denied', err => {
                console.error(`[Sync] ${name} denied:`, err);
                updateSyncUI('error');
            }).on('error', err => {
                console.error(`[Sync] ${name} error:`, err);
                updateSyncUI('offline');
            });

            syncHandlers.push(handler);
        });
    }

    // Expose for external use
    window.startAllSync = startAllSync;
    window.restartSync = () => {
        const ip = localStorage.getItem('offgrid-couch-ip');
        const port = localStorage.getItem('offgrid-couch-port') || '5984';
        const user = localStorage.getItem('offgrid-couch-user') || 'admin';
        const pass = localStorage.getItem('offgrid-couch-pass') || '';
        if (ip) startAllSync(ip, port, user, pass);
    };

    function updateSyncUI(state) {
        if (!syncIndicator || !syncText) return;
        const syncDotEl = document.getElementById('sync-dot') || syncIndicator;
        const syncTextEl = document.getElementById('sync-text') || syncText;
        const badgeEl = document.getElementById('sync-status');

        // Reset dot classes
        syncDotEl.className = 'status-dot';
        if (badgeEl) {
            badgeEl.classList.remove('badge-online', 'badge-offline', 'badge-syncing');
        }

        switch (state) {
            case 'offline':
                syncDotEl.classList.add('offline');
                syncTextEl.textContent = 'Cloud: Off';
                if (badgeEl) badgeEl.classList.add('badge-offline');
                break;
            case 'online':
                syncDotEl.classList.add('online');
                syncTextEl.textContent = 'Synced ✓';
                if (badgeEl) badgeEl.classList.add('badge-online');
                break;
            case 'syncing':
            case 'active':
                syncDotEl.classList.add('syncing');
                syncTextEl.textContent = 'Syncing…';
                if (badgeEl) badgeEl.classList.add('badge-syncing');
                break;
            case 'error':
                syncDotEl.classList.add('error');
                syncTextEl.textContent = 'Sync Error';
                if (badgeEl) badgeEl.classList.add('badge-offline');
                break;
        }
    }

    // Run auto-sync after all handlers are wired.
    tryInitialSync();
});
