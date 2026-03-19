// OffGridLink - Teacher WebTorrent Module
// Seeds large quiz packages (PDFs, images, videos) as LAN torrents

(function () {
    const WEBTORRENT_PATH = './webtorrent.min.js';
    let client = null;
    let seedingTorrents = {}; // quizId -> torrent

    function initWebTorrent() {
        if (!window.WebTorrent) {
            console.warn('[WebTorrent] Not available (global WebTorrent not found)');
            return;
        }
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

            return new Promise((resolve, reject) => {
                client.seed(file, torrent => {
                    console.log('[WebTorrent] Seeding quiz:', quiz.title);
                    console.log('[WebTorrent] Magnet Link:', torrent.magnetURI);

                    seedingTorrents[quizId] = torrent;

                    // Display magnet link
                    const torrentInfo = document.getElementById('torrent-info');
                    const magnetDisplay = document.getElementById('magnet-display');
                    const qrDiv = document.getElementById('magnet-qr');

                    if (torrentInfo) torrentInfo.style.display = 'block';
                    if (magnetDisplay) magnetDisplay.textContent = torrent.magnetURI;

                    // Generate QR Code
                    if (qrDiv && window.QRCode) {
                        qrDiv.innerHTML = '';
                        new QRCode(qrDiv, {
                            text: torrent.magnetURI,
                            width: 256,
                            height: 256,
                            colorDark: "#000000",
                            colorLight: "#ffffff",
                            correctLevel: QRCode.CorrectLevel.M
                        });
                    }

                    showToast('🌊 Seeding via WebTorrent! Share the QR or magnet link.', 'success');

                    // Update seeding status periodically
                    const interval = setInterval(() => {
                        if (!torrent || torrent.destroyed) {
                            clearInterval(interval);
                            return;
                        }
                        console.log(`[WebTorrent] ${quiz.title} - Peers: ${torrent.numPeers}, Uploaded: ${formatBytes(torrent.uploaded)}`);
                    }, 5000);

                    resolve(torrent.magnetURI);
                });
            });
        } catch (err) {
            console.error('[WebTorrent] Seed error:', err);
            showToast('WebTorrent seed failed: ' + err.message, 'error');
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
        initWebTorrent();

        const seedBtn = document.getElementById('seed-torrent-btn');
        if (seedBtn) {
            seedBtn.addEventListener('click', async () => {
                const select = document.getElementById('distribute-quiz-select');
                const quizId = select ? select.value : '';
                if (!quizId) { showToast('Select a quiz first', 'error'); return; }
                seedBtn.textContent = '⏳ Seeding…';
                await window.seedQuizPackage(quizId);
                seedBtn.textContent = '🌊 Seed via WebTorrent';
            });
        }
    });
})();
