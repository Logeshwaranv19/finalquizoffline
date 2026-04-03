// OffGridLink - Student PeerJS Module
// Connects to teacher, receives quizzes, sends submissions
// v2: Stable Peer ID, auto-reconnect, quiz list browsing

(function () {
    const PEERJS_PATH = './peerjs.min.js';
    let peer = null;
    let teacherConn = null;
    let studentPeerId = null;
    let reconnectTimer = null;
    let countdownInterval = null;
    let savedTeacherIP = null;
    let savedTeacherId = null;
    let savedStudentName = null;
    let isConnecting = false;

    // ─── Stable Peer ID ──────────────────────────────────────
    function getOrCreateStudentId() {
        let id = localStorage.getItem('student-stable-peer-id');
        if (!id) {
            // Generate a short stable ID
            id = 'student-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem('student-stable-peer-id', id);
        }
        return id;
    }

    function loadPeerJS(callback) {
        if (window.Peer) { callback(); return; }
        const s = document.createElement('script');
        s.src = PEERJS_PATH;
        s.onload = callback;
        s.onerror = () => {
            console.warn('[Student PeerJS] CDN load failed');
            updateP2PStatus(false, 'PeerJS unavailable');
        };
        document.head.appendChild(s);
    }

    function initStudentPeer() {
        loadPeerJS(() => {
            if (!window.Peer) return;

            const stableId = getOrCreateStudentId();

            // Destroy any existing peer before creating a new one
            if (peer && !peer.destroyed) { peer.destroy(); }

            // Use stable ID with public broker just to get an ID
            try {
                peer = new Peer(stableId, { debug: 1, config: { iceServers: [] } });
            } catch (e) {
                // If ID conflicts (happens on reconnect sometimes), use undefined
                peer = new Peer(undefined, { debug: 1, config: { iceServers: [] } });
            }

            peer.on('open', id => {
                studentPeerId = id;
                // Persist the actual assigned ID
                localStorage.setItem('student-stable-peer-id', id);
                console.log('[Student PeerJS] My Peer ID:', id);
                const el = document.getElementById('my-peer-id');
                if (el) el.textContent = id;
                window.studentPeerId = id;
                updateP2PStatus(false, 'P2P Ready');
            });

            peer.on('error', err => {
                console.error('[Student PeerJS] Error:', err.type, err.message);
                if (err.type === 'unavailable-id') {
                    // Remove saved ID and recreate with a random one
                    localStorage.removeItem('student-stable-peer-id');
                    setTimeout(initStudentPeer, 500);
                }
                updateP2PStatus(false, 'P2P Error');
            });

            peer.on('disconnected', () => {
                updateP2PStatus(false, 'Disconnected');
                setTimeout(() => { if (peer && !peer.destroyed) peer.reconnect(); }, 3000);
            });
        });
    }

    // ─── Connect to Teacher ──────────────────────────────────
    window.connectToTeacher = function (teacherIP, teacherId, studentName) {
        if (isConnecting) return;
        isConnecting = true;

        // Save for auto-reconnect
        savedTeacherIP = teacherIP;
        savedTeacherId = teacherId;
        savedStudentName = studentName;

        // Clear any pending reconnect timer
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

        if (teacherConn) { try { teacherConn.close(); } catch (e) {} }

        console.log('[Student PeerJS] Connecting to teacher server at:', teacherIP);
        updateP2PStatus(false, 'Connecting…');

        // Destroy old peer and create new one pointing to teacher's local server
        if (peer && !peer.destroyed) { peer.destroy(); peer = null; }

        const stableId = getOrCreateStudentId();

        try {
            peer = new Peer(stableId, {
                host: teacherIP || 'localhost',
                port: 9000,
                path: '/offgrid',
                debug: 1,
                config: { iceServers: [] }
            });
        } catch (e) {
            peer = new Peer(undefined, {
                host: teacherIP || 'localhost',
                port: 9000,
                path: '/offgrid',
                debug: 1,
                config: { iceServers: [] }
            });
        }

        peer.on('open', (id) => {
            studentPeerId = id;
            localStorage.setItem('student-stable-peer-id', id);
            window.studentPeerId = id;
            const el = document.getElementById('my-peer-id');
            if (el) el.textContent = id;

            console.log('[Student PeerJS] Signaling open. Connecting to peer:', teacherId);

            teacherConn = peer.connect(teacherId, {
                reliable: true,
                metadata: { name: studentName, role: 'student' }
            });

            setupConnectionListeners(teacherId, studentName);
            isConnecting = false;
        });

        peer.on('error', err => {
            console.error('[Student PeerJS] Peer error:', err.type, err.message);
            updateP2PStatus(false, 'Signaling Error');
            showToast('Signaling failed. Check Teacher IP (' + teacherIP + ') and ensure teacher app is running.', 'error');
            isConnecting = false;
            scheduleReconnect();
        });
    };

    function setupConnectionListeners(teacherPeerId, studentName) {
        if (!teacherConn) return;

        teacherConn.on('open', () => {
            console.log('[Student PeerJS] Connected to teacher!');
            updateP2PStatus(true, 'Connected to Teacher');
            showToast('Connected to teacher!', 'success');

            // Save credentials with consistent key names
            localStorage.setItem('student-name', studentName);
            localStorage.setItem('last-teacher-ip', savedTeacherIP || '');
            localStorage.setItem('teacher-peer-id', teacherPeerId);

            // Cancel any reconnect timer as we're now connected
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

            // Try to send pending submissions
            setTimeout(retryPendingSubmissions, 2000);
        });

        teacherConn.on('data', data => {
            console.log('[Student PeerJS] Data from teacher:', data);
            handleTeacherMessage(data);
        });

        teacherConn.on('close', () => {
            console.log('[Student PeerJS] Teacher connection closed');
            teacherConn = null;
            updateP2PStatus(false, 'Teacher Disconnected');
            showToast('Teacher disconnected. Attempting to reconnect…', 'info');
            scheduleReconnect();
        });

        teacherConn.on('error', err => {
            console.error('[Student PeerJS] Connection error:', err);
            updateP2PStatus(false, 'Connection Error');
            showToast('Connection error: ' + err, 'error');
            scheduleReconnect();
        });
    }

    // ─── Auto-Reconnect ──────────────────────────────────────
    function scheduleReconnect() {
        if (!savedTeacherIP || !savedTeacherId) return;
        if (reconnectTimer) return; // already scheduled

        updateP2PStatus(false, 'Reconnecting in 5s…');
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (!teacherConn || !teacherConn.open) {
                console.log('[Student PeerJS] Auto-reconnecting…');
                window.connectToTeacher(savedTeacherIP, savedTeacherId, savedStudentName || localStorage.getItem('student-name') || 'Student');
            }
        }, 5000);
    }

    // ─── Teacher Message Handler ─────────────────────────────
    async function handleTeacherMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'welcome':
                console.log('[Student PeerJS] Welcome from teacher:', data);
                showToast('Welcome! Teacher is ready.', 'success');
                break;

            case 'quiz_data':
                console.log('[Student PeerJS] Received quiz:', data.quiz.title);
                await storeStudentQuiz(data.quiz);
                break;

            case 'quiz_list':
                // Teacher sent a list of available quizzes
                console.log('[Student PeerJS] Received quiz list:', data.quizzes);
                window.dispatchEvent(new CustomEvent('quiz-list-received', { detail: { quizzes: data.quizzes } }));
                break;

            case 'submission_ack':
                console.log('[Student PeerJS] Submission acknowledged:', data.submissionId);
                showToast('Your answers were received by the teacher!', 'success');
                if (data.submissionId) {
                    try {
                        const sub = await window.submissionsDB.get(data.submissionId);
                        sub.syncStatus = 'received_by_teacher';
                        await window.submissionsDB.put(sub);
                    } catch (e) {
                        console.error('[Student PeerJS] Failed to update submission ACK status:', e);
                    }
                }
                break;

            case 'quiz_error':
                console.error('[Student PeerJS] Quiz error from teacher:', data.message);
                showToast(data.message || 'Failed to receive quiz. Please ask the teacher to resend.', 'error');
                break;

            case 'pong':
                break;

            default:
                console.log('[Student PeerJS] Unknown message type:', data.type);
        }
    }

    // ─── Store Quiz Locally ──────────────────────────────────
    async function storeStudentQuiz(quiz) {
        try {
            let existing;
            try { existing = await window.quizzesDB.get(quiz._id); } catch (e) { existing = null; }

            const doc = {
                ...quiz,
                type: 'student_quiz',
                status: existing ? (existing.status || 'new') : 'new',
                receivedAt: new Date().toISOString()
            };
            if (existing) doc._rev = existing._rev;

            await window.quizzesDB.put(doc);
            console.log('[Student] Quiz stored:', quiz.title);
            showToast(`Quiz received: "${quiz.title}"`, 'success');

            // Switch to quiz tab automatically
            const quizzesNav = document.querySelector('[data-screen="quizzes"]');
            if (quizzesNav) quizzesNav.click();

            window.dispatchEvent(new Event('quiz-received'));
        } catch (err) {
            console.error('[Student] Error storing quiz:', err);
        }
    }

    // ─── Request Quiz List from Teacher ─────────────────────
    window.requestQuizList = function () {
        if (!teacherConn || !teacherConn.open) {
            showToast('Not connected to teacher', 'error');
            return;
        }
        teacherConn.send({ type: 'quiz_list_request' });
        showToast('Fetching quiz list from teacher…', 'info');
    };

    // ─── Request Specific Quiz from Teacher ──────────────────
    window.requestQuizFromTeacher = function (quizId) {
        if (!teacherConn || !teacherConn.open) {
            showToast('Not connected to teacher', 'error');
            return;
        }
        teacherConn.send({ type: 'quiz_request', quizId });
        showToast('Downloading quiz from teacher…', 'info');
    };

    // ─── Submit Answers via P2P ──────────────────────────────
    window.submitAnswersP2P = async function (quizId, quizTitle, answers, studentName) {
        const submission = {
            type: 'submission',
            quizId,
            quizTitle,
            studentName: studentName || localStorage.getItem('student-name') || 'Anonymous',
            answers,
            submittedAt: new Date().toISOString()
        };

        const subDoc = {
            _id: `sub_${quizId}_${studentPeerId ? studentPeerId.replace(/[^a-z0-9]/gi, '').substr(0, 10) : 'local'}`,
            ...submission,
            studentId: studentPeerId || 'local',
            syncStatus: 'pending'
        };

        try {
            await window.submissionsDB.put(subDoc);
            console.log('[Student] Submission saved locally:', subDoc._id);
        } catch (err) {
            console.error('[Student] Error saving submission locally:', err);
        }

        if (teacherConn && teacherConn.open) {
            try {
                teacherConn.send(submission);
                console.log('[Student] Submission sent to teacher via P2P');
                try {
                    const saved = await window.submissionsDB.get(subDoc._id);
                    await window.submissionsDB.put({ ...saved, syncStatus: 'sent' });
                } catch (e) { console.error('[Student] Failed to update submission sync status:', e); }
            } catch (err) {
                console.warn('[Student] P2P send failed, staying deferred:', err);
                showToast('Saved locally. Will sync when teacher is available.', 'info');
            }
        } else {
            showToast('Saved! Will sync to teacher when connected.', 'info');
        }

        schedulePendingRetry();
        return subDoc._id;
    };

    // ─── Retry Pending Submissions ───────────────────────────
    async function retryPendingSubmissions() {
        if (!teacherConn || !teacherConn.open) return;
        try {
            const result = await window.submissionsDB.allDocs({ include_docs: true });
            const pending = result.rows.map(r => r.doc).filter(d => d.syncStatus === 'pending');
            for (const sub of pending) {
                try {
                    teacherConn.send({
                        type: 'submission',
                        quizId: sub.quizId,
                        quizTitle: sub.quizTitle,
                        studentName: sub.studentName,
                        answers: sub.answers,
                        submittedAt: sub.submittedAt
                    });
                    const upd = await window.submissionsDB.get(sub._id);
                    await window.submissionsDB.put({ ...upd, syncStatus: 'sent' });
                    console.log('[Student] Deferred submission sent:', sub._id);
                    showToast(`Synced pending submission for "${sub.quizTitle}"`, 'success');
                } catch (e) {
                    console.warn('[Student] Retry failed for:', sub._id, e);
                }
            }
        } catch (e) { console.error('[Student] Failed to load pending submissions for retry:', e); }
    }

    function schedulePendingRetry() {
        setTimeout(retryPendingSubmissions, 5000);
    }

    // ─── P2P Status ──────────────────────────────────────────
    function updateP2PStatus(connected, text) {
        const badge = document.getElementById('p2p-badge');
        const dot = document.getElementById('p2p-dot');
        const label = document.getElementById('p2p-label');
        const banner = document.getElementById('reconnect-banner');

        if (badge) {
            badge.classList.toggle('badge-online', connected);
            badge.classList.toggle('badge-offline', !connected);
        }
        if (dot) {
            dot.classList.toggle('online', connected);
            dot.classList.toggle('offline', !connected);
        }
        if (label) label.textContent = text || (connected ? 'Connected' : 'P2P');
        if (banner) {
            if (connected) {
                banner.style.display = 'none';
                if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
                const cd = document.getElementById('reconnect-countdown');
                if (cd) cd.textContent = '';
            } else {
                banner.style.display = 'flex';
                // Start 5s countdown display
                if (countdownInterval) clearInterval(countdownInterval);
                let secs = 5;
                const cd = document.getElementById('reconnect-countdown');
                if (cd) cd.textContent = `(${secs}s)`;
                countdownInterval = setInterval(() => {
                    secs--;
                    if (secs <= 0) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                        if (cd) cd.textContent = '';
                    } else {
                        if (cd) cd.textContent = `(${secs}s)`;
                    }
                }, 1000);
            }
        }
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

    // ─── DOM Ready ───────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const connectBtn = document.getElementById('connect-btn');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => {
                const name = document.getElementById('student-name').value.trim();
                const teacherIP = document.getElementById('teacher-ip-input').value.trim();
                const rawId = document.getElementById('teacher-peer-id-input').value.trim();
                if (!name) { showToast('Please enter your name', 'error'); return; }
                if (!teacherIP) { showToast('Please enter the Teacher IP', 'error'); return; }
                if (!rawId) { showToast('Please enter the Teacher Peer ID', 'error'); return; }
                // Normalize: "482-391" or "482391" → "teacher-482391"; already-full IDs pass through
                const digitsOnly = rawId.replace(/-/g, '');
                const teacherId = /^\d{6}$/.test(digitsOnly)
                    ? 'teacher-' + digitsOnly
                    : rawId;
                window.connectToTeacher(teacherIP, teacherId, name);
            });
        }

        // Manual reconnect button in banner
        const reconnectNowBtn = document.getElementById('reconnect-now-btn');
        if (reconnectNowBtn) {
            reconnectNowBtn.addEventListener('click', () => {
                if (savedTeacherIP && savedTeacherId) {
                    window.connectToTeacher(savedTeacherIP, savedTeacherId, savedStudentName || localStorage.getItem('student-name') || 'Student');
                } else {
                    showToast('No saved teacher info. Please connect manually.', 'error');
                }
            });
        }

        // Restore saved values
        const savedName = localStorage.getItem('student-name');
        const savedIP = localStorage.getItem('last-teacher-ip');
        const savedId = localStorage.getItem('teacher-peer-id');

        if (savedName && document.getElementById('student-name'))
            document.getElementById('student-name').value = savedName;
        if (savedIP && document.getElementById('teacher-ip-input'))
            document.getElementById('teacher-ip-input').value = savedIP;
        if (savedId && document.getElementById('teacher-peer-id-input'))
            document.getElementById('teacher-peer-id-input').value = savedId;

        // Initialize peer with stable ID
        initStudentPeer();
    });

    window.studentPeerModule = { initStudentPeer };
})();
