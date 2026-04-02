// OffGridLink - Teacher WebTorrent Module
// Seeds large quiz packages (PDFs, images, videos) as LAN torrents

(function () {
    const WEBTORRENT_PATH = './webtorrent.min.js';
    let client = null;
    let seedingTorrents = {}; // quizId -> torrent
    let localTrackerUrl = null;

    async function getTrackerUrl() {
        try {
            const res = await fetch('/api/tracker-url');
            const { url } = await res.json();
            return url;
        } catch (e) {
            // Electron mode: /api/tracker-url not available, use known local IP
            const ip = window.teacherLocalIP || 'localhost';
            return `ws://${ip}:8000`;
        }
    }

    function resolveTeacherIpHint() {
        const input = document.getElementById('teacher-ip-display');
        const inputIp = input ? input.value.trim() : '';
        if (inputIp) return inputIp;
        if (window.teacherLocalIP) return window.teacherLocalIP;
        return 'localhost';
    }

    function normalizeTrackerUrl(url) {
        if (!url) return `ws://${resolveTeacherIpHint()}:8000`;
        if (url.includes('://localhost:') || url.includes('://127.0.0.1:')) {
            return `ws://${resolveTeacherIpHint()}:8000`;
        }
        return url;
    }

    async function resolveTrackerUrlForSeed() {
        try {
            const trackerUrl = await getTrackerUrl();
            return normalizeTrackerUrl(trackerUrl);
        } catch (_) {
            return `ws://${resolveTeacherIpHint()}:8000`;
        }
    }

    async function publishFallbackPackage(quizId, quizPackage) {
        const candidates = ['/api/publish-quiz-package'];
        if (window.teacherLocalIP) {
            candidates.push(`http://${window.teacherLocalIP}:3000/api/publish-quiz-package`);
        }
        candidates.push('http://localhost:3000/api/publish-quiz-package');

        for (const url of candidates) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ quizId, package: quizPackage })
                });
                if (!res.ok) {
                    console.warn('[WebTorrent] Fallback publish non-OK:', url, res.status);
                    continue;
                }
                const data = await res.json();
                if (data && data.url) {
                    console.log('[WebTorrent] HTTP fallback published at:', data.url);
                    return data.url;
                }
            } catch (err) {
                console.warn('[WebTorrent] Fallback publish failed:', url, err && err.message ? err.message : err);
            }
        }

        return null;
    }

    function renderTransferPayload(labelText, payloadText) {
        const torrentInfo = document.getElementById('torrent-info');
        const transferLabel = document.getElementById('transfer-link-label');
        const magnetDisplay = document.getElementById('magnet-display');
        const qrDiv = document.getElementById('magnet-qr');

        if (torrentInfo) torrentInfo.style.display = 'flex';
        if (transferLabel) transferLabel.innerHTML = `${labelText}:`;
        if (magnetDisplay) magnetDisplay.textContent = payloadText;

        if (qrDiv && window.QRCode) {
            qrDiv.innerHTML = '';
            new QRCode(qrDiv, {
                text: payloadText,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }

    async function initWebTorrent() {
        if (!window.WebTorrent) {
            console.warn('[WebTorrent] Not available (global WebTorrent not found)');
            return;
        }
        localTrackerUrl = await resolveTrackerUrlForSeed();
        console.log('[WebTorrent] Using local tracker:', localTrackerUrl);

        client = new WebTorrent();
        console.log('[WebTorrent] Client initialized from global instance');

        client.on('error', err => {
            console.error('[WebTorrent] Client error:', err);
        });
    }

    // Seed a quiz package (JSON + any attached files)
    window.seedQuizPackage = async function (quizId) {
        if (!client) {
            showToast('WebTorrent not initialized', 'error');
            return null;
        }

        try {
            const quiz = await window.quizzesDB.get(quizId);

            // Create a quiz package blob
            const quizPackage = {
                version: '1.0',
                quiz: window.teacherPeerModule.makeStudentVersion(quiz),
                packagedAt: new Date().toISOString()
            };

            const jsonStr = JSON.stringify(quizPackage, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });

            // Create a File object for WebTorrent seeding
            const file = new File([blob], `${quiz.title.replace(/[^a-z0-9]/gi, '_')}_quiz.json`, {
                type: 'application/json'
            });

            localTrackerUrl = await resolveTrackerUrlForSeed();
            const seedOpts = localTrackerUrl ? { announce: [localTrackerUrl] } : {};
            console.log('[WebTorrent] Seed options:', seedOpts);

            return new Promise((resolve, reject) => {
                client.seed(file, seedOpts, torrent => {
                    const shareMagnet = torrent.magnetURI;

                    console.log('[WebTorrent] Seeding quiz:', quiz.title);
                    console.log('[WebTorrent] Magnet Link:', torrent.magnetURI);
                    console.log('[WebTorrent] Share Magnet:', shareMagnet);

                    seedingTorrents[quizId] = torrent;

                    renderTransferPayload('WebTorrent Magnet Link', shareMagnet);

                    showToast('Seeding via WebTorrent! Share the QR or magnet link.', 'success');

                    torrent.on('wire', (wire) => {
                        console.log('[WebTorrent] Wire connected:', wire && wire.remoteAddress ? wire.remoteAddress : 'unknown');
                        showToast(`Student connected (${torrent.numPeers} peer${torrent.numPeers !== 1 ? 's' : ''})`, 'success');
                    });

                    torrent.on('noPeers', (announceType) => {
                        console.warn('[WebTorrent] No peers via', announceType);
                    });

                    torrent.on('warning', (err) => {
                        console.warn('[WebTorrent] Torrent warning:', err && err.message ? err.message : err);
                    });

                    torrent.on('trackerAnnounce', () => {
                        console.log('[WebTorrent] Tracker announce succeeded for quiz:', quizId);
                    });

                    torrent.on('trackerWarning', (err) => {
                        console.warn('[WebTorrent] Tracker warning for quiz:', quizId, err && err.message ? err.message : err);
                    });

                    torrent.on('trackerError', (err) => {
                        console.error('[WebTorrent] Tracker error for quiz:', quizId, err && err.message ? err.message : err);
                    });

                    torrent.on('error', (err) => {
                        console.error('[WebTorrent] Torrent error for quiz:', quizId, err && err.message ? err.message : err);
                    });

                    // Update seeding status periodically
                    const interval = setInterval(() => {
                        if (!torrent || torrent.destroyed) {
                            clearInterval(interval);
                            return;
                        }
                        console.log(`[WebTorrent] ${quiz.title} - Peers: ${torrent.numPeers}, Uploaded: ${formatBytes(torrent.uploaded)}`);
                    }, 5000);

                    resolve(shareMagnet);
                });
            });
        } catch (err) {
            console.error('[WebTorrent] Seed error:', err);
            showToast('WebTorrent seed failed: ' + err.message, 'error');
            return null;
        }
    };

    window.publishQuizPackageLocalLan = async function (quizId) {
        try {
            const quiz = await window.quizzesDB.get(quizId);
            const quizPackage = {
                version: '1.0',
                quiz: window.teacherPeerModule.makeStudentVersion(quiz),
                packagedAt: new Date().toISOString()
            };

            const directUrl = await publishFallbackPackage(quizId, quizPackage);
            if (!directUrl) {
                showToast('Local Wi-Fi transfer link could not be published', 'error');
                return null;
            }

            renderTransferPayload('Direct LAN Link', directUrl);
            console.log('[WebTorrent] Local Wi-Fi transfer link:', directUrl);
            showToast('Local Wi-Fi transfer link ready. Share QR or link.', 'success');
            return directUrl;
        } catch (err) {
            console.error('[WebTorrent] Local Wi-Fi publish error:', err);
            showToast('Local Wi-Fi transfer failed: ' + err.message, 'error');
            return null;
        }
    };

    // Stop seeding a specific quiz
    window.stopSeeding = function (quizId) {
        if (seedingTorrents[quizId]) {
            seedingTorrents[quizId].destroy();
            delete seedingTorrents[quizId];
            console.log('[WebTorrent] Stopped seeding quiz:', quizId);
        }
    };

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function showToast(message, type = 'info') {
        if (window.showToast) { window.showToast(message, type); return; }
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Wire up seed button when DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        initWebTorrent().catch(err => console.error('[WebTorrent] Init error:', err));

        const seedBtn = document.getElementById('seed-torrent-btn');
        if (seedBtn) {
            seedBtn.addEventListener('click', async () => {
                const select = document.getElementById('distribute-quiz-select');
                const quizId = select ? select.value : '';
                if (!quizId) { showToast('Select a quiz first', 'error'); return; }
                seedBtn.textContent = 'Seeding…';
                await window.seedQuizPackage(quizId);
                seedBtn.textContent = '🌊 Seed via WebTorrent';
            });
        }

        const localLanBtn = document.getElementById('local-lan-transfer-btn');
        if (localLanBtn) {
            localLanBtn.addEventListener('click', async () => {
                const select = document.getElementById('distribute-quiz-select');
                const quizId = select ? select.value : '';
                if (!quizId) { showToast('Select a quiz first', 'error'); return; }
                localLanBtn.textContent = 'Preparing…';
                await window.publishQuizPackageLocalLan(quizId);
                localLanBtn.textContent = '📶 Local Wi-Fi Transfer';
            });
        }
    });
})();
