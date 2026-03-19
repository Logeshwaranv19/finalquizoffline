// OffGridLink - Teacher PeerJS Module
// v2: Stable Peer ID, quiz preload cache, quiz list broadcasting, QR code display

(function () {
    const PEERJS_PATH = './peerjs.min.js';

    let peer = null;
    let connectedPeers = {}; // { peerId: DataConnection }
    let connectedNames = {}; // { peerId: studentName }
    let teacherPeerId = null;
    let quizCache = {}; // quizId -> quiz (preloaded for fast distribution)

    // ─── Stable Teacher Peer ID ──────────────────────────────
    function getOrCreateTeacherId() {
        let id = localStorage.getItem('teacher-stable-peer-id');
        if (!id) {
            id = 'teacher-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem('teacher-stable-peer-id', id);
        }
        return id;
    }

    // ── AUTO-DETECT IP HELPER ─────────────────────────────
    function autoDetectIP(peerId) {
        const ipEl = document.getElementById('teacher-ip-display');
        
        function setDetectedIP(ip) {
            if (ipEl) ipEl.value = ip;
            window.teacherLocalIP = ip;
            localStorage.setItem('teacher-local-ip', ip);
            generateQRCode(peerId, ip);
            console.log('[PeerJS] Detected local IP:', ip);
        }

        function fallbackToSavedIP() {
            const savedIP = localStorage.getItem('teacher-local-ip');
            if (savedIP && ipEl) ipEl.value = savedIP;
            window.teacherLocalIP = savedIP || null;
            generateQRCode(peerId, savedIP || null);
            console.warn('[PeerJS] Could not auto-detect IP. Using saved:', savedIP);
        }

        if (window.electronAPI) {
            window.electronAPI.onLocalIP((ip) => {
                setDetectedIP(ip);
            });
        } else {
            fetch('/api/local-ip')
                .then(r => r.json())
                .then(data => {
                    if (data && data.ip) setDetectedIP(data.ip);
                    else fallbackToSavedIP();
                })
                .catch(() => fallbackToSavedIP());
        }
    }

    function loadPeerJS(callback) {
        if (window.Peer) { callback(); return; }
        const s = document.createElement('script');
        s.src = PEERJS_PATH;
        s.onload = callback;
        s.onerror = () => { console.warn('[PeerJS] CDN load failed - offline?'); };
        document.head.appendChild(s);
    }

    function initTeacherPeer() {
        const stableId = getOrCreateTeacherId();
        const el = document.getElementById('teacher-peer-id');
        if (el) el.textContent = stableId;

        // ── AUTO-DETECT IP IMMEDIATELY ──
        autoDetectIP(stableId);

        const ipEl = document.getElementById('teacher-ip-display');
        if (ipEl) {
            // Regenerate QR if teacher manually edits the IP field
            ipEl.addEventListener('input', () => {
                const v = ipEl.value.trim();
                window.teacherLocalIP = v;
                localStorage.setItem('teacher-local-ip', v);
                generateQRCode(window.teacherPeerId || stableId, v);
            });
        }

        loadPeerJS(() => {
            if (!window.Peer) {
                updateP2PStatus(false, 'PeerJS unavailable');
                return;
            }

            // Try to connect to local Electron peer server first
            const peerOptions = {
                host: 'localhost',
                port: 9000,
                path: '/offgrid',
                debug: 1
            };

            try {
                peer = new Peer(stableId, peerOptions);
            } catch (e) {
                peer = new Peer(undefined, peerOptions);
            }

            peer.on('open', id => {
                teacherPeerId = id;
                // Update stored stable ID if server assigned a different one
                localStorage.setItem('teacher-stable-peer-id', id);
                console.log('[PeerJS] Teacher Peer ID:', id);

                if (el) el.textContent = id;
                updateP2PStatus(true, `P2P Online – ${Object.keys(connectedPeers).length} students`);
                window.teacherPeerId = id;

                // Preload all published quizzes into memory cache
                preloadQuizCache();
            });

            peer.on('connection', conn => {
                console.log('[PeerJS] New student connected:', conn.peer);
                setupConnection(conn);
            });

            peer.on('error', err => {
                console.error('[PeerJS] Error:', err.type, err.message);
                // If local server not available, fall back to public broker
                if (err.type === 'server-error' || err.type === 'network') {
                    console.log('[PeerJS] Local server failed. Falling back to public broker...');
                    fallbackToPublicBroker(stableId);
                } else {
                    updateP2PStatus(false, 'P2P Error: ' + err.type);
                }
            });

            peer.on('disconnected', () => {
                console.warn('[PeerJS] Disconnected from broker, reconnecting...');
                updateP2PStatus(false, 'Reconnecting…');
                peer.reconnect();
            });
        });
    }

    function fallbackToPublicBroker(stableId) {
        if (peer && !peer.destroyed) { peer.destroy(); }
        try {
            peer = new Peer(stableId, { debug: 1 });
        } catch (e) {
            peer = new Peer(undefined, { debug: 1 });
        }

        peer.on('open', id => {
            teacherPeerId = id;
            localStorage.setItem('teacher-stable-peer-id', id);
            const el = document.getElementById('teacher-peer-id');
            if (el) el.textContent = id;
            updateP2PStatus(true, 'P2P Online (Public Broker)');
            window.teacherPeerId = id;
            
            autoDetectIP(id);
            preloadQuizCache();
        });

        peer.on('connection', conn => { setupConnection(conn); });
        peer.on('error', err => {
            console.error('[PeerJS] Public broker error:', err.type);
            updateP2PStatus(false, 'P2P Error: ' + err.type);
        });
        peer.on('disconnected', () => {
            updateP2PStatus(false, 'Reconnecting…');
            peer.reconnect();
        });
    }

    function setupConnection(conn) {
        conn.on('open', () => {
            connectedPeers[conn.peer] = conn;
            const studentName = (conn.metadata && conn.metadata.name) ? conn.metadata.name : conn.peer.substring(0, 8) + '…';
            connectedNames[conn.peer] = studentName;
            console.log('[PeerJS] Connection open with:', conn.peer, 'Name:', studentName);
            renderConnectedPeers();
            showToast(`🟢 Student connected: ${studentName}`, 'success');

            // Send welcome with server time
            conn.send({ type: 'welcome', teacherId: teacherPeerId, serverTime: Date.now() });
        });

        conn.on('data', data => {
            console.log('[PeerJS] Received from', conn.peer, ':', data);
            handleStudentMessage(conn.peer, data);
        });

        conn.on('close', () => {
            const name = connectedNames[conn.peer] || conn.peer.substring(0, 8);
            console.log('[PeerJS] Connection closed:', conn.peer);
            delete connectedPeers[conn.peer];
            delete connectedNames[conn.peer];
            renderConnectedPeers();
            showToast(`🔴 ${name} disconnected`, 'info');
        });

        conn.on('error', err => {
            console.error('[PeerJS] Connection error:', err);
            delete connectedPeers[conn.peer];
            delete connectedNames[conn.peer];
            renderConnectedPeers();
        });
    }

    // ─── Handle Student Messages ─────────────────────────────
    async function handleStudentMessage(peerId, data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'quiz_request':
                console.log('[PeerJS] Quiz request from:', peerId, 'for:', data.quizId);
                await sendQuizToPeer(peerId, data.quizId);
                break;

            case 'quiz_list_request':
                console.log('[PeerJS] Quiz list request from:', peerId);
                await sendQuizListToPeer(peerId);
                break;

            case 'submission':
                console.log('[PeerJS] Submission received from:', peerId);
                await handleSubmission(peerId, data);
                break;

            case 'ping':
                if (connectedPeers[peerId]) {
                    connectedPeers[peerId].send({ type: 'pong', time: Date.now() });
                }
                break;

            default:
                console.log('[PeerJS] Unknown message type:', data.type);
        }
    }

    // ─── Send Quiz to Peer (from cache for speed) ────────────
    async function sendQuizToPeer(peerId, quizId) {
        try {
            let studentVersion;

            // Try from in-memory cache first (sub-1ms)
            if (quizCache[quizId]) {
                studentVersion = makeStudentVersion(quizCache[quizId]);
            } else {
                const quiz = await window.quizzesDB.get(quizId);
                studentVersion = makeStudentVersion(quiz);
            }

            if (connectedPeers[peerId]) {
                connectedPeers[peerId].send({ type: 'quiz_data', quiz: studentVersion });
                const name = connectedNames[peerId] || peerId.substring(0, 8);
                console.log('[PeerJS] Sent quiz to:', name);
                showToast(`📤 Quiz sent to ${name}`, 'success');
            }
        } catch (err) {
            console.error('[PeerJS] Error sending quiz:', err);
        }
    }

    // ─── Send Quiz List to Peer ──────────────────────────────
    async function sendQuizListToPeer(peerId) {
        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc)
                .filter(d => d.type === 'quiz' && d.isPublished)
                .map(q => ({
                    _id: q._id,
                    title: q.title,
                    subject: q.subject || 'General',
                    questions: q.questions.length,
                    totalPoints: q.totalPoints,
                    timeLimit: q.timeLimit,
                    createdAt: q.createdAt
                }));

            if (connectedPeers[peerId]) {
                connectedPeers[peerId].send({ type: 'quiz_list', quizzes });
                console.log('[PeerJS] Sent quiz list to:', peerId, '- Count:', quizzes.length);
            }
        } catch (err) {
            console.error('[PeerJS] Error sending quiz list:', err);
        }
    }

    // ─── Handle Submission ───────────────────────────────────
    async function handleSubmission(peerId, data) {
        try {
            const studentName = data.studentName || connectedNames[peerId] || 'Anonymous';
            const submission = {
                _id: `sub_${data.quizId}_${peerId.replace(/[^a-z0-9]/gi, '').substr(0, 10)}`,
                type: 'submission',
                quizId: data.quizId,
                quizTitle: data.quizTitle || '',
                studentId: peerId,
                studentName,
                answers: data.answers || {},
                submittedAt: data.submittedAt || new Date().toISOString(),
                syncStatus: 'received'
            };

            await window.submissionsDB.put(submission);
            console.log('[PeerJS] Submission saved:', submission._id);

            // Auto-score immediately
            if (typeof window.autoScoreSubmission === 'function') {
                await window.autoScoreSubmission(submission);
            }

            // Acknowledge
            if (connectedPeers[peerId]) {
                connectedPeers[peerId].send({
                    type: 'submission_ack',
                    submissionId: submission._id,
                    status: 'received'
                });
            }

            window.dispatchEvent(new Event('submission-received'));
            showToast(`✅ Submission from ${studentName}`, 'success');
        } catch (err) {
            console.error('[PeerJS] Error handling submission:', err);
        }
    }

    // ─── Broadcast Quiz to All Students ─────────────────────
    window.sendQuizToAllStudents = async function (quizId) {
        const peers = Object.keys(connectedPeers);
        if (peers.length === 0) {
            showToast('No students connected!', 'error');
            return;
        }

        let studentVersion;
        if (quizCache[quizId]) {
            studentVersion = makeStudentVersion(quizCache[quizId]);
        } else {
            const quiz = await window.quizzesDB.get(quizId);
            studentVersion = makeStudentVersion(quiz);
        }

        peers.forEach(peerId => {
            connectedPeers[peerId].send({ type: 'quiz_data', quiz: studentVersion });
        });

        showToast(`📤 Quiz sent to ${peers.length} student(s)`, 'success');
        console.log('[PeerJS] Quiz broadcasted to', peers.length, 'peers');
    };

    // ─── Strip Answer Fields for Students ───────────────────
    function makeStudentVersion(quiz) {
        return {
            _id: quiz._id,
            type: 'student_quiz',
            title: quiz.title,
            subject: quiz.subject,
            description: quiz.description,
            timeLimit: quiz.timeLimit,
            createdBy: quiz.createdBy,
            createdAt: quiz.createdAt,
            totalPoints: quiz.totalPoints,
            questions: quiz.questions.map(q => ({
                id: q.id,
                type: q.type,
                text: q.text,
                options: q.options || [],
                points: q.points
                // answer field intentionally stripped
            }))
        };
    }
    window.teacherPeerModule = { initTeacherPeer, makeStudentVersion };

    // ─── Preload Quiz Cache ──────────────────────────────────
    async function preloadQuizCache() {
        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            quizCache = {};
            result.rows.forEach(r => {
                if (r.doc && r.doc.type === 'quiz') {
                    quizCache[r.doc._id] = r.doc;
                }
            });
            console.log('[PeerJS] Quiz cache loaded:', Object.keys(quizCache).length, 'quizzes');
        } catch (e) {
            console.warn('[PeerJS] Cache preload failed:', e);
        }
    }

    // Refresh cache when DB changes
    window.addEventListener('db-changed', () => preloadQuizCache());
    window.addEventListener('quiz-saved', () => preloadQuizCache());

    // ─── Render Connected Peers ──────────────────────────────
    function renderConnectedPeers() {
        const container = document.getElementById('connected-peers-list');
        if (!container) return;
        const peers = Object.keys(connectedPeers);
        const countEl = document.getElementById('connected-count');
        if (countEl) countEl.textContent = peers.length;

        if (peers.length === 0) {
            container.innerHTML = '<span style="color:var(--text3);font-size:12px;">None connected</span>';
        } else {
            container.innerHTML = peers.map(p => {
                const name = connectedNames[p] || p.substring(0, 12) + '…';
                return `<span class="peer-chip">🟢 ${name}</span>`;
            }).join('');
        }
        updateP2PStatus(true, `P2P Online – ${peers.length} student(s)`);
    }

    // ─── P2P Status Dot ─────────────────────────────────────
    function updateP2PStatus(online, text) {
        const dot = document.getElementById('p2p-dot');
        const textEl = document.getElementById('p2p-text');
        if (dot) {
            dot.style.background = online ? 'var(--green)' : 'var(--text3)';
            dot.style.boxShadow = online ? '0 0 6px var(--green)' : 'none';
        }
        if (textEl) textEl.textContent = text || (online ? 'P2P: Online' : 'P2P: Offline');
    }

    // ─── QR Code Generation ──────────────────────────────────
    function generateQRCode(peerId, ip) {
        const container = document.getElementById('qr-container');
        if (!container) return;

        const info = ip
            ? `OffGridLink\nIP:${ip}:9000\nPeerID:${peerId}`
            : `OffGridLink\nPeerID:${peerId}`;

        // Use local QRCode (already loaded in teacher.html)
        if (window.QRCode) {
            container.innerHTML = '';
            new QRCode(container, {
                text: info,
                width: 180,
                height: 180,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    // ─── Detect Local IP (Browser) ───────────────────────────
    async function detectLocalIP() {
        return new Promise(resolve => {
            try {
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel('');
                pc.createOffer().then(o => pc.setLocalDescription(o));
                pc.onicecandidate = e => {
                    if (!e || !e.candidate) { pc.close(); resolve(null); return; }
                    const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
                    if (match && !match[1].startsWith('127.') && !match[1].startsWith('169.')) {
                        pc.close();
                        resolve(match[1]);
                    }
                };
                setTimeout(() => { pc.close(); resolve(null); }, 2000);
            } catch (e) { resolve(null); }
        });
    }

    // ─── Toast Helper ────────────────────────────────────────
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

    // ─── DOM Ready ───────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Copy peer ID button
        const copyBtn = document.getElementById('copy-peer-id-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const id = document.getElementById('teacher-peer-id').textContent;
                if (!id || id === 'Initializing…') { showToast('Peer ID not ready yet', 'error'); return; }
                navigator.clipboard.writeText(id).then(() => {
                    copyBtn.textContent = '✓ Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                }).catch(() => {
                    // Fallback for older browsers
                    const el = document.createElement('textarea');
                    el.value = id;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                    copyBtn.textContent = '✓ Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                });
            });
        }

        initTeacherPeer();
    });
})();
