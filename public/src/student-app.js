// OffGridLink - Student App Logic
// Quiz list, quiz attempt (timer, MCQ options), submission, results

document.addEventListener('DOMContentLoaded', () => {

    // ─── Toast System ───────────────────────────────────────
    window.showToast = function (message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    // ─── State ──────────────────────────────────────────────
    let currentQuiz = null;
    let studentAnswers = {};
    let timerInterval = null;
    let timeLeft = 0;

    // ─── Quiz List ───────────────────────────────────────────
    async function loadQuizList() {
        const list = document.getElementById('quiz-list');
        if (!list) return;

        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d =>
                d.type === 'student_quiz' || d.type === 'quiz'
            );

            // Fetch results for status marking
            const resultsRes = await window.resultsDB.allDocs({ include_docs: true });
            const gradedQuizIds = new Set(resultsRes.rows.filter(r => r.doc.type === 'result').map(r => r.doc.quizId));

            list.innerHTML = '';
            quizzes.sort((a, b) => (b.receivedAt || b.createdAt || '').localeCompare(a.receivedAt || a.createdAt || '')).forEach(quiz => {
                list.appendChild(createQuizCard(quiz, gradedQuizIds.has(quiz._id)));
            });

            // Check pending submissions
            checkPendingSubmissions();
        } catch (err) {
            console.error('[Student App] Error loading quizzes:', err);
        }
    }

    function createQuizCard(quiz, isGraded = false) {
        const div = document.createElement('div');
        div.className = 'quiz-card';

        const statusMap = {
            'new': '<span class="status-pill pill-new">● New</span>',
            'attempted': '<span class="status-pill pill-attempted">● In Progress</span>',
            'submitted': isGraded ? '<span class="status-pill pill-submitted" style="background:var(--green);color:#fff">✓ Graded</span>' : '<span class="status-pill pill-submitted">✓ Submitted</span>'
        };
        const pill = statusMap[quiz.status || 'new'] || statusMap['new'];

        div.innerHTML = `
            <div class="quiz-card-icon">📝</div>
            <div class="quiz-card-title">${quiz.title}</div>
            <div class="quiz-card-meta">
                ${quiz.subject || 'General'} ·
                ${quiz.questions ? quiz.questions.length : 0} questions ·
                ${quiz.totalPoints || 0} pts ·
                ${quiz.timeLimit ? quiz.timeLimit + ' min' : 'No time limit'}
            </div>
            <div class="quiz-card-footer">
                ${pill}
                ${quiz.status === 'submitted'
                ? '<button class="btn btn-ghost btn-sm view-result-btn">View Result</button>'
                : '<button class="btn btn-primary btn-sm start-btn">Start Quiz →</button>'}
            </div>`;

        const startBtn = div.querySelector('.start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startQuiz(quiz);
            });
        }

        const viewBtn = div.querySelector('.view-result-btn');
        if (viewBtn) {
            viewBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await showResultForQuiz(quiz._id);
            });
        }

        div.addEventListener('click', () => startQuiz(quiz));

        return div;
    }

    // ─── Start Quiz ──────────────────────────────────────────
    async function startQuiz(quiz) {
        currentQuiz = quiz;
        studentAnswers = {};

        // Load saved answers if attempted before
        try {
            const subResult = await window.submissionsDB.allDocs({ include_docs: true });
            const existing = subResult.rows.map(r => r.doc).find(d =>
                d.quizId === quiz._id && d.syncStatus !== 'submitted'
            );
            if (existing && existing.answers) {
                studentAnswers = { ...existing.answers };
            }
        } catch (e) { }

        // Set up attempt header
        document.getElementById('attempt-quiz-title').textContent = quiz.title;
        document.getElementById('attempt-quiz-meta').textContent =
            `${quiz.questions.length} questions · ${quiz.totalPoints} pts · ${quiz.subject || 'General'}`;

        // Render questions
        renderQuestions(quiz.questions);

        // Start timer if time limit set
        if (quiz.timeLimit && quiz.timeLimit > 0) {
            timeLeft = quiz.timeLimit * 60;
            startTimer();
        } else {
            const timerBadge = document.getElementById('timer-badge');
            if (timerBadge) timerBadge.style.display = 'none';
        }

        // Mark as attempted
        try {
            const updated = await window.quizzesDB.get(quiz._id);
            if (updated.status !== 'submitted') {
                updated.status = 'attempted';
                await window.quizzesDB.put(updated);
            }
        } catch (e) { }

        window.showScreen('screen-take-quiz');
        window.scrollTo(0, 0);
    }

    function renderQuestions(questions) {
        const container = document.getElementById('questions-container');
        if (!container) return;
        container.innerHTML = '';

        questions.forEach((q, index) => {
            const div = document.createElement('div');
            div.className = 'question-card';

            let answerHtml = '';
            if (q.type === 'mcq') {
                const letters = ['A', 'B', 'C', 'D'];
                answerHtml = (q.options || []).map((opt, i) =>
                    `<button class="option-btn ${studentAnswers[q.id] === letters[i] ? 'selected' : ''}"
                        data-qid="${q.id}" data-val="${letters[i]}">
                        <span class="option-letter">${letters[i]}</span>
                        <span>${opt || '(empty option)'}</span>
                    </button>`
                ).join('');
            } else {
                answerHtml = `<textarea class="short-answer-input" data-qid="${q.id}"
                    placeholder="Type your answer here...">${studentAnswers[q.id] || ''}</textarea>`;
            }

            div.innerHTML = `
                <div class="question-num">Question ${index + 1} of ${questions.length} · ${q.points || 1} pt${q.points > 1 ? 's' : ''}</div>
                <div class="question-text">${q.text}</div>
                ${answerHtml}`;

            // MCQ option click
            div.querySelectorAll('.option-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qid = btn.dataset.qid;
                    const val = btn.dataset.val;
                    studentAnswers[qid] = val;

                    // Update visual state
                    div.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    btn.querySelector('.option-letter').style.background = 'var(--accent)';
                    btn.querySelector('.option-letter').style.color = '#fff';

                    updateProgress();
                });
            });

            // Short answer input
            const shortInput = div.querySelector('.short-answer-input');
            if (shortInput) {
                shortInput.addEventListener('input', e => {
                    studentAnswers[q.id] = e.target.value;
                    updateProgress();
                });
            }

            container.appendChild(div);
        });

        updateProgress();
    }

    function updateProgress() {
        if (!currentQuiz) return;
        const total = currentQuiz.questions.length;
        const answered = Object.keys(studentAnswers).filter(k => studentAnswers[k]).length;
        const pct = total > 0 ? (answered / total) * 100 : 0;
        const bar = document.getElementById('progress-fill');
        if (bar) bar.style.width = pct + '%';
    }

    function startTimer() {
        const badge = document.getElementById('timer-badge');
        const display = document.getElementById('timer-display');
        if (badge) badge.style.display = 'flex';
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            if (display) display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            if (timeLeft <= 60 && badge) badge.classList.add('urgent');
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                showToast('⏰ Time is up! Submitting automatically…', 'error');
                submitQuiz(true);
            }
        }, 1000);
    }

    // ─── Submit Quiz ─────────────────────────────────────────
    const submitBtn = document.getElementById('submit-quiz-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => submitQuiz(false));
    }

    async function submitQuiz(autoSubmit = false) {
        if (!currentQuiz) return;

        const unanswered = currentQuiz.questions.filter(q => !studentAnswers[q.id]);
        if (!autoSubmit && unanswered.length > 0) {
            if (!confirm(`You have ${unanswered.length} unanswered question(s). Submit anyway?`)) return;
        }

        clearInterval(timerInterval);

        const studentName = localStorage.getItem('student-name') || 'Anonymous';

        // Submit via P2P (with local fallback)
        const subId = await window.submitAnswersP2P(
            currentQuiz._id,
            currentQuiz.title,
            studentAnswers,
            studentName
        );

        // Mark quiz as submitted
        try {
            const updated = await window.quizzesDB.get(currentQuiz._id);
            updated.status = 'submitted';
            await window.quizzesDB.put(updated);
        } catch (e) { }

        // Show result screen (local preview since we don't have teacher scoring yet)
        showLocalResult(currentQuiz, studentAnswers, subId);
    }

    function showLocalResult(quiz, answers, subId) {
        // For MCQ quizzes — we can show a preview (teacher has the real score)
        // Student quiz doesn't have answers, so we show "submitted" state
        const total = quiz.questions.length;
        const questionCount = total;

        document.getElementById('result-title').textContent = 'Quiz Submitted! 🎉';
        document.getElementById('result-status').textContent = 'Your answers have been saved. Teacher will share your score.';
        document.getElementById('result-percentage').textContent = '✓';
        document.getElementById('result-correct').textContent = Object.keys(answers).filter(k => answers[k]).length;
        document.getElementById('result-total-q').textContent = questionCount;
        document.getElementById('result-pts').textContent = `${Object.keys(answers).filter(k => answers[k]).length}/${questionCount}`;

        const circle = document.getElementById('result-circle');
        if (circle) {
            circle.className = 'result-circle result-good';
            circle.querySelector('.percentage').textContent = '✓';
        }

        const breakdown = document.getElementById('result-breakdown');
        if (breakdown) {
            breakdown.innerHTML = `
                <div style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);border-radius:12px;padding:14px;text-align:center;">
                    <div style="font-size:13px;color:var(--text2);">📊 Full results will be available after the teacher grades your submission.</div>
                </div>`;
        }

        window.showScreen('screen-result');

        // Switch nav to quizzes
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    }

    async function showResultForQuiz(quizId) {
        try {
            const result = await window.resultsDB.allDocs({ include_docs: true });
            const myResult = result.rows.map(r => r.doc).find(d =>
                d.type === 'result' && d.quizId === quizId
            );

            if (!myResult) {
                showToast('Result not yet available from teacher', 'info');
                return;
            }

            document.getElementById('result-title').textContent = myResult.quizTitle;
            document.getElementById('result-status').textContent = `Graded on ${new Date(myResult.gradedAt).toLocaleDateString()}`;
            document.getElementById('result-percentage').textContent = myResult.percentage + '%';
            document.getElementById('result-correct').textContent = myResult.breakdown.filter(b => b.correct === true).length;
            document.getElementById('result-total-q').textContent = myResult.breakdown.length;
            document.getElementById('result-pts').textContent = `${myResult.score}/${myResult.totalPoints}`;

            const circle = document.getElementById('result-circle');
            if (circle) {
                const cls = myResult.percentage >= 70 ? 'result-good' : myResult.percentage >= 40 ? 'result-mid' : 'result-low';
                circle.className = `result-circle ${cls}`;
                circle.querySelector('.percentage').textContent = myResult.percentage + '%';
            }

            window.showScreen('screen-result');
        } catch (err) {
            console.error('[Student App] Error showing result:', err);
        }
    }

    async function checkPendingSubmissions() {
        try {
            const result = await window.submissionsDB.allDocs({ include_docs: true });
            const pending = result.rows.filter(r => r.doc.syncStatus === 'pending').length;
            const badge = document.getElementById('pending-count-badge');
            if (badge) {
                if (pending > 0) {
                    badge.style.display = 'flex';
                    badge.textContent = `⏳ ${pending} pending submission(s) — will auto-sync when teacher connects`;
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) { }
    }

    // ─── QR Code Scanner ─────────────────────────────────────
    const startScanBtn = document.getElementById('start-scan-btn');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    const qrReader = document.getElementById('qr-reader');
    let html5QrcodeScanner = null;

    if (startScanBtn && stopScanBtn && qrReader) {
        startScanBtn.addEventListener('click', () => {
            qrReader.style.display = 'block';
            stopScanBtn.style.display = 'block';
            startScanBtn.style.display = 'none';

            if (!html5QrcodeScanner) {
                // Wait for Html5Qrcode to be available
                if (typeof Html5Qrcode === 'undefined') {
                    showToast('QR Scanner library still loading...', 'error');
                    stopScanner();
                    return;
                }
                html5QrcodeScanner = new Html5Qrcode("qr-reader");
            }

            html5QrcodeScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    console.log(`[Scanner] Scanned: ${decodedText}`);
                    
                    const trimmedScan = decodedText.trim();

                    // Option A: Magnet Link
                    if (trimmedScan.startsWith('magnet:?')) {
                        const magnetInput = document.getElementById('magnet-input');
                        if (magnetInput) magnetInput.value = trimmedScan;
                        
                        showToast('🧲 Magnet Link Detected!', 'success');
                        stopScanner();
                        
                        // Automatically start download
                        downloadQuizFromTorrent(trimmedScan);
                        return;
                    }

                    // Option B: Teacher Connection Info
                    const lines = trimmedScan.split('\n');
                    if (lines.length > 0 && lines[0].trim() === 'OffGridLink') {
                        lines.forEach(line => {
                            if (line.startsWith('IP:')) {
                                const fullIp = line.replace('IP:', '').trim();
                                const pureIp = fullIp.split(':')[0]; // Strip port
                                document.getElementById('teacher-ip-input').value = pureIp;
                            } else if (line.startsWith('PeerID:')) {
                                document.getElementById('teacher-peer-id-input').value = line.replace('PeerID:', '').trim();
                            }
                        });
                        
                        showToast('✅ Teacher Info Scanned!', 'success');
                        stopScanner();
                        
                        // Set default name if empty
                        const nameEl = document.getElementById('student-name');
                        if (!nameEl.value.trim()) {
                            nameEl.value = localStorage.getItem('student-name') || 'Student ' + Math.floor(Math.random() * 1000);
                        }
                        
                        const ip = document.getElementById('teacher-ip-input').value;
                        const peerId = document.getElementById('teacher-peer-id-input').value;
                        if (ip && peerId) {
                            setTimeout(() => {
                                const btn = document.getElementById('connect-btn');
                                if (btn) btn.click();
                            }, 500);
                        }
                    } else {
                        showToast('⚠️ Unknown QR Code format.', 'error');
                        stopScanner();
                    }
                },
                (err) => { /* ignore normal errors */ }
            ).catch(err => {
                showToast("Camera access failed or denied.", "error");
                stopScanner();
            });
        });

        stopScanBtn.addEventListener('click', stopScanner);

        function stopScanner() {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.stop().then(() => {
                    qrReader.style.display = 'none';
                    stopScanBtn.style.display = 'none';
                    startScanBtn.style.display = 'flex'; // Use flex since btn-ghost is flex
                }).catch(err => console.error("Scanner stop fail:", err));
            } else {
                qrReader.style.display = 'none';
                stopScanBtn.style.display = 'none';
                startScanBtn.style.display = 'flex';
            }
        }
    }

    // ─── WebTorrent download ─────────────────────────────────
    const joinTorrentBtn = document.getElementById('join-torrent-btn');
    if (joinTorrentBtn) {
        joinTorrentBtn.addEventListener('click', () => {
            const magnet = document.getElementById('magnet-input').value.trim();
            if (!magnet) { showToast('Please enter a magnet link', 'error'); return; }
            downloadQuizFromTorrent(magnet);
        });
    }

    function downloadQuizFromTorrent(magnetURI) {
        if (!window.WebTorrent) {
            showToast('WebTorrent library not loaded', 'error');
            return;
        }
        startTorrentDownload(magnetURI);
    }

    function startTorrentDownload(magnetURI) {
        showToast('⬇️ Connecting to torrent swarm…', 'info');
        const client = new WebTorrent();
        client.add(magnetURI, torrent => {
            torrent.files.forEach(file => {
                file.getBuffer((err, buffer) => {
                    if (err) { showToast('Torrent download error: ' + err.message, 'error'); return; }
                    try {
                        const text = new TextDecoder().decode(buffer);
                        const pkg = JSON.parse(text);
                        if (pkg.quiz) {
                            storeStudentQuizLocal(pkg.quiz);
                            showToast('📚 Quiz downloaded from torrent!', 'success');
                        }
                    } catch (e) {
                        console.error('[Torrent] Parse error:', e);
                        showToast('Invalid quiz file', 'error');
                    }
                });
            });
        });
    }

    async function storeStudentQuizLocal(quiz) {
        try {
            let existing;
            try { existing = await window.quizzesDB.get(quiz._id); } catch (e) { existing = null; }
            const doc = { ...quiz, type: 'student_quiz', status: 'new', receivedAt: new Date().toISOString() };
            if (existing) doc._rev = existing._rev;
            await window.quizzesDB.put(doc);
            window.dispatchEvent(new Event('quiz-received'));
        } catch (e) { console.error('[Student] Store error:', e); }
    }

    // ─── Back buttons ────────────────────────────────────────
    const backToQuizzesBtn = document.getElementById('back-to-quizzes-btn');
    if (backToQuizzesBtn) {
        backToQuizzesBtn.addEventListener('click', () => {
            clearInterval(timerInterval);
            window.showScreen('screen-quizzes');
        });
    }

    const backFromResult = document.getElementById('back-from-result-btn');
    if (backFromResult) {
        backFromResult.addEventListener('click', () => {
            window.showScreen('screen-quizzes');
            document.querySelectorAll('.nav-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.screen === 'quizzes');
            });
            loadQuizList();
        });
    }

    // ─── Event Listeners ─────────────────────────────────────
    window.addEventListener('quiz-received', loadQuizList);
    window.addEventListener('db-changed', loadQuizList);

    // ─── Init ────────────────────────────────────────────────
    loadQuizList();
});
