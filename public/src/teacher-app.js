// OffGridLink - Teacher App Logic
// Quiz CRUD, UI rendering, auto-scoring, distribution controls

function esc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {

    // ─── Toast System ───────────────────────────────────────
    window.showToast = function (message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3500);
    };

    // ─── State ──────────────────────────────────────────────
    let questions = [];
    let questionCounter = 0;
    let editingQuizId = null;
    
    // ─── Caching & Performance ───────────────────────────────
    let cachedQuizzes = [];
    let cachedResults = [];
    let quizCardsMap = new Map(); // quizId -> card element for incremental updates
    let responseCardsMap = new Map(); // resultId -> card element for incremental updates

    // ─── Quiz Creator ────────────────────────────────────────
    const addMcqBtn = document.getElementById('add-mcq-btn');
    const addShortBtn = document.getElementById('add-short-btn');
    const questionsList = document.getElementById('questions-list');
    const saveDraftBtn = document.getElementById('save-draft-btn');
    const publishBtn = document.getElementById('publish-quiz-btn');

    if (addMcqBtn) addMcqBtn.addEventListener('click', () => addQuestion('mcq'));
    if (addShortBtn) addShortBtn.addEventListener('click', () => addQuestion('short'));
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => saveQuiz(false));
    if (publishBtn) publishBtn.addEventListener('click', () => saveQuiz(true));

    function addQuestion(type) {
        questionCounter++;
        const qId = 'q' + questionCounter;
        const q = { id: qId, type, text: '', options: type === 'mcq' ? ['', '', '', ''] : [], answer: '', answerType: 'single', points: 1 };
        questions.push(q);
        renderQuestion(q, questions.length - 1);
    }

    function renderQuestion(q, index) {
        if (!questionsList) return;

        const div = document.createElement('div');
        div.className = 'question-item';
        div.dataset.qid = q.id;

        const _isMulti = q.answerType === 'multi';
        const _multiAnswers = Array.isArray(q.answer) ? q.answer : [];
        const optionsHtml = q.type === 'mcq' ? `
            <div class="form-group" style="margin-top:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
                    <label class="form-label" style="margin:0;">Answer Options &amp; Correct Answer</label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:12px;color:var(--text-muted);margin-right:2px;">Answer Type:</span>
                        <button class="q-type-btn" data-type="single" style="padding:4px 12px;font-size:12px;border-radius:4px;border:1px solid var(--border);cursor:pointer;background:${!_isMulti ? 'var(--accent)' : 'var(--surface)'};color:${!_isMulti ? '#000' : 'var(--text)'};font-weight:${!_isMulti ? '600' : '400'};">Single</button>
                        <button class="q-type-btn" data-type="multi" style="padding:4px 12px;font-size:12px;border-radius:4px;border:1px solid var(--border);cursor:pointer;background:${_isMulti ? 'var(--accent)' : 'var(--surface)'};color:${_isMulti ? '#000' : 'var(--text)'};font-weight:${_isMulti ? '600' : '400'};">Multiple</button>
                    </div>
                </div>
                <div class="q-options">
                    ${['A', 'B', 'C', 'D'].map((letter, i) => `
                        <div class="q-option-input-row" style="display:flex;align-items:center;gap:8px;">
                            <input type="radio" class="q-radio-mark" name="correct-${q.id}" data-letter="${letter}" ${!_isMulti && q.answer === letter ? 'checked' : ''} title="Mark as correct" style="width:16px;height:16px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;${_isMulti ? 'display:none' : ''}">
                            <input type="checkbox" class="q-check-mark" data-letter="${letter}" ${_multiAnswers.includes(letter) ? 'checked' : ''} title="Mark as correct" style="width:16px;height:16px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;${!_isMulti ? 'display:none' : ''}">
                            <span class="q-option-label" style="min-width:22px;">${letter}.</span>
                            <input type="text" class="q-option" data-opt="${i}" placeholder="Option ${letter}" value="${q.options[i] || ''}" style="flex:1;">
                        </div>
                    `).join('')}
                </div>
                <div class="q-answer-hint" style="margin-top:6px;font-size:11px;color:var(--text-muted);">${_isMulti ? '✓ Check all correct answers' : '● Select the one correct answer'}</div>
            </div>` : `
            <div class="form-group" style="margin-top:10px;">
                <label class="form-label">Model Answer (for reference)</label>
                <input type="text" class="q-answer-short" placeholder="Expected answer..." value="${q.answer || ''}">
            </div>`;

        div.innerHTML = `
            <div class="q-num">Question ${index + 1} – ${q.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}</div>
            <button class="remove-q-btn" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            <div class="form-group">
                <label class="form-label">Question Text *</label>
                <textarea class="q-text" placeholder="Enter your question here..." rows="2">${q.text || ''}</textarea>
            </div>
            ${optionsHtml}
            <div class="q-actions">
                <div style="display:flex;align-items:center;gap:8px;">
                    <label class="form-label" style="margin:0">Points:</label>
                    <input type="number" class="q-points" value="${q.points}" min="1" max="100" style="width:70px;">
                </div>
            </div>`;

        // Event listeners for this question
        div.querySelector('.remove-q-btn').addEventListener('click', () => {
            questions = questions.filter(item => item.id !== q.id);
            div.remove();
            renumberQuestions();
        });

        div.querySelector('.q-text').addEventListener('input', e => { q.text = e.target.value; });

        if (q.type === 'mcq') {
            div.querySelectorAll('.q-option').forEach((input, i) => {
                input.addEventListener('input', e => { q.options[i] = e.target.value; });
            });

            div.querySelectorAll('.q-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.type;
                    if (q.answerType === type) return;
                    q.answerType = type;
                    q.answer = type === 'multi' ? [] : '';
                    const radios = div.querySelectorAll('.q-radio-mark');
                    const checks = div.querySelectorAll('.q-check-mark');
                    const hint = div.querySelector('.q-answer-hint');
                    if (type === 'multi') {
                        radios.forEach(r => { r.checked = false; r.style.display = 'none'; });
                        checks.forEach(c => { c.checked = false; c.style.display = ''; });
                        if (hint) hint.textContent = '✓ Check all correct answers';
                    } else {
                        checks.forEach(c => { c.checked = false; c.style.display = 'none'; });
                        radios.forEach(r => { r.checked = false; r.style.display = ''; });
                        if (hint) hint.textContent = '● Select the one correct answer';
                    }
                    div.querySelectorAll('.q-type-btn').forEach(b => {
                        const active = b.dataset.type === type;
                        b.style.background = active ? 'var(--accent)' : 'var(--surface)';
                        b.style.color = active ? '#000' : 'var(--text)';
                        b.style.fontWeight = active ? '600' : '400';
                    });
                });
            });

            div.querySelectorAll('.q-radio-mark').forEach(radio => {
                radio.addEventListener('change', () => { q.answer = radio.dataset.letter; });
            });

            div.querySelectorAll('.q-check-mark').forEach(cb => {
                cb.addEventListener('change', () => {
                    if (!Array.isArray(q.answer)) q.answer = [];
                    const letter = cb.dataset.letter;
                    if (cb.checked) {
                        if (!q.answer.includes(letter)) q.answer.push(letter);
                    } else {
                        q.answer = q.answer.filter(l => l !== letter);
                    }
                });
            });
        } else {
            div.querySelector('.q-answer-short').addEventListener('input', e => { q.answer = e.target.value; });
        }

        div.querySelector('.q-points').addEventListener('input', e => { q.points = parseInt(e.target.value) || 1; });

        questionsList.appendChild(div);
    }

    function renumberQuestions() {
        const items = questionsList.querySelectorAll('.question-item');
        items.forEach((item, i) => {
            const numEl = item.querySelector('.q-num');
            if (numEl) {
                const typeLabel = item.querySelector('.q-answer-select') ? 'Multiple Choice' : 'Short Answer';
                numEl.textContent = `Question ${i + 1} – ${typeLabel}`;
            }
        });
    }

    async function saveQuiz(publish = false) {
        const title = document.getElementById('quiz-title').value.trim();
        const subject = document.getElementById('quiz-subject').value.trim();
        const timeLimit = parseInt(document.getElementById('quiz-time').value) || 0;
        const teacher = document.getElementById('quiz-teacher').value.trim();
        const desc = document.getElementById('quiz-desc').value.trim();

        if (!title) { showToast('Please enter a quiz title', 'error'); return; }
        if (questions.length === 0) { showToast('Add at least one question', 'error'); return; }

        // Validate questions
        for (const q of questions) {
            if (!q.text.trim()) { showToast('All questions must have text', 'error'); return; }
            if (q.type === 'mcq') {
                const noAnswer = q.answerType === 'multi'
                    ? (!Array.isArray(q.answer) || q.answer.length === 0)
                    : !q.answer;
                if (noAnswer) { showToast('Select correct answer for all MCQ questions', 'error'); return; }
            }
        }

        const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);
        const quizId = editingQuizId || `quiz_${Date.now()}`;

        const quiz = {
            _id: quizId,
            type: 'quiz',
            title,
            subject,
            description: desc,
            timeLimit,
            createdBy: teacher || 'Teacher',
            createdAt: new Date().toISOString(),
            questions: questions.map(q => ({ ...q })), // full version with answers
            totalPoints,
            isPublished: publish
        };

        try {
            // Check if updating
            if (editingQuizId) {
                const existing = await window.quizzesDB.get(editingQuizId);
                quiz._rev = existing._rev;
            }
            await window.quizzesDB.put(quiz);

            showToast(publish ? '✅ Quiz published!' : '💾 Draft saved!', 'success');

            // Notify peerjs module to refresh its quiz cache
            window.dispatchEvent(new Event('quiz-saved'));

            // Reset form
            resetCreator();
            loadQuizzes();
            updateDistributeSelect();

            // Switch to My Quizzes tab
            if (publish) {
                document.querySelector('[data-tab="quizzes"]').click();
            }
        } catch (err) {
            console.error('[Teacher] Error saving quiz:', err);
            // If IndexedDB connection closed (e.g. after page refresh), reinit and retry once
            if (err.message && err.message.includes('IDBDatabase')) {
                try {
                    if (typeof window.createDBs === 'function') window.createDBs();
                    await new Promise(r => setTimeout(r, 300)); // brief wait for DB to open
                    if (editingQuizId) {
                        try { const ex = await window.quizzesDB.get(editingQuizId); quiz._rev = ex._rev; } catch (_) { }
                    }
                    await window.quizzesDB.put(quiz);
                    showToast(publish ? '✅ Quiz published!' : '💾 Draft saved!', 'success');
                    resetCreator();
                    loadQuizzes();
                    updateDistributeSelect();
                    if (publish) document.querySelector('[data-tab="quizzes"]').click();
                    return;
                } catch (retryErr) {
                    console.error('[Teacher] Retry also failed:', retryErr);
                }
            }
            showToast('Failed to save quiz: ' + err.message, 'error');
        }
    }

    function resetCreator() {
        document.getElementById('quiz-title').value = '';
        document.getElementById('quiz-subject').value = '';
        document.getElementById('quiz-desc').value = '';
        document.getElementById('quiz-time').value = '30';
        if (questionsList) questionsList.innerHTML = '';
        questions = [];
        questionCounter = 0;
        editingQuizId = null;
    }

    // ─── My Quizzes Tab ─────────────────────────────────────
    // Use PouchDB change listener instead of polling allDocs() on every event
    function initQuizChangeListener() {
        if (window.quizzesDB && typeof window.quizzesDB.changes === 'function') {
            let isInitialized = false;
            window.quizzesDB.changes({
                since: 'now',
                live: true,
                include_docs: true
            }).on('change', () => {
                // Debounce to avoid excessive reloads
                if (!isInitialized) {
                    isInitialized = true;
                    loadQuizzes(); // Initial load
                } else {
                    // Subsequent changes - reload with small debounce
                    clearTimeout(window.quizChangeTimeout);
                    window.quizChangeTimeout = setTimeout(loadQuizzes, 300);
                }
            }).on('error', (err) => console.error('[Teacher] Quiz change listener error:', err));
        }
    }

    async function loadQuizzes() {
        const list = document.getElementById('quiz-list');
        if (!list) return;

        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d => d.type === 'quiz');
            cachedQuizzes = quizzes; // Cache for batched updates

            document.getElementById('quiz-count').textContent = quizzes.length;
            document.getElementById('stat-total').textContent = quizzes.length;
            document.getElementById('stat-published').textContent = quizzes.filter(q => q.isPublished).length;

            if (quizzes.length === 0) {
                list.innerHTML = `<div class="empty-state"><div class="icon">📚</div><p>No quizzes yet. Go to <strong>Create Quiz</strong> to get started!</p></div>`;
                quizCardsMap.clear();
                return;
            }

            // Incremental update: Only add/remove changed items
            const currentIds = new Set(quizCardsMap.keys());
            const newIds = new Set(quizzes.map(q => q._id));
            const sortedQuizzes = quizzes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            
            // Remove deleted quizzes
            for (const id of currentIds) {
                if (!newIds.has(id)) {
                    const card = quizCardsMap.get(id);
                    if (card && card.parentNode) card.remove();
                    quizCardsMap.delete(id);
                }
            }

            // Add new or update existing quizzes - use DocumentFragment for batch operations
            const fragment = document.createDocumentFragment();
            let addedAny = false;

            sortedQuizzes.forEach(quiz => {
                if (quizCardsMap.has(quiz._id)) {
                    // Update existing card in place (could enhance with content comparison)
                    const card = quizCardsMap.get(quiz._id);
                    updateQuizCard(card, quiz); // New helper function
                } else {
                    // Add new card
                    const card = createQuizCard(quiz);
                    quizCardsMap.set(quiz._id, card);
                    fragment.appendChild(card);
                    addedAny = true;
                }
            });

            if (addedAny) {
                list.appendChild(fragment);
            }

            // Maintain correct order
            const actualOrder = Array.from(list.querySelectorAll('.quiz-card')).map(card => {
                const quiz = cachedQuizzes.find(q => q._id === card.dataset.quizId);
                return quiz ? quiz._id : null;
            });
            
            const expectedIds = sortedQuizzes.map(q => q._id);
            if (actualOrder.join() !== expectedIds.join()) {
                // Re-insert in correct order
                sortedQuizzes.forEach(quiz => {
                    const card = quizCardsMap.get(quiz._id);
                    if (card) list.appendChild(card); // Move to end in order
                });
            }
        } catch (err) {
            console.error('[Teacher] Error loading quizzes:', err);
        }
    }

    // Helper to update quiz card UI without recreating it
    function updateQuizCard(cardElement, quiz) {
        const nameEl = cardElement.querySelector('.quiz-name');
        const metaEl = cardElement.querySelector('.quiz-meta');
        
        if (nameEl) nameEl.textContent = esc(quiz.title);
        if (metaEl) {
            const pill = quiz.isPublished
                ? '<span class="status-pill pill-published">● Published</span>'
                : '<span class="status-pill pill-draft">○ Draft</span>';
            metaEl.innerHTML = `
                ${esc(quiz.subject || 'General')} ·
                ${quiz.questions.length} questions ·
                ${quiz.totalPoints} pts ·
                ${quiz.timeLimit ? quiz.timeLimit + ' min' : 'No limit'}
                ${pill}
            `;
        }
        cardElement.dataset.quizId = quiz._id;
    }

    function createQuizCard(quiz) {
        const div = document.createElement('div');
        div.className = 'quiz-card';
        div.dataset.quizId = quiz._id; // Track for incremental updates

        const pill = quiz.isPublished
            ? '<span class="status-pill pill-published">● Published</span>'
            : '<span class="status-pill pill-draft">○ Draft</span>';

        div.innerHTML = `
            <div class="quiz-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
            <div class="quiz-info">
                <div class="quiz-name">${esc(quiz.title)}</div>
                <div class="quiz-meta">
                    ${esc(quiz.subject || 'General')} ·
                    ${quiz.questions.length} questions ·
                    ${quiz.totalPoints} pts ·
                    ${quiz.timeLimit ? quiz.timeLimit + ' min' : 'No limit'}
                    ${pill}
                </div>
            </div>
            <div class="quiz-actions">
                <button class="btn btn-ghost btn-sm edit-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>
                <button class="btn btn-primary btn-sm dist-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Distribute</button>
                <button class="btn btn-danger btn-sm del-btn" title="Delete quiz"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div>`;

        // Use event delegation - don't add listeners here
        // Event delegation handler is on #quiz-list container
        return div;
    }

    async function editQuiz(quiz) {
        // Pre-fill creator form
        document.getElementById('quiz-title').value = quiz.title;
        document.getElementById('quiz-subject').value = quiz.subject || '';
        document.getElementById('quiz-desc').value = quiz.description || '';
        document.getElementById('quiz-time').value = quiz.timeLimit || 0;
        document.getElementById('quiz-teacher').value = quiz.createdBy || '';

        // Load questions
        questions = quiz.questions.map(q => ({ ...q }));
        questionCounter = questions.length;
        if (questionsList) questionsList.innerHTML = '';
        questions.forEach((q, i) => renderQuestion(q, i));

        editingQuizId = quiz._id;
        document.querySelector('[data-tab="create"]').click();
        showToast('Quiz loaded for editing', 'info');
    }

    async function distributeQuiz(quiz) {
        // Switch to connect tab and pre-select this quiz
        document.querySelector('[data-tab="connect"]').click();
        const select = document.getElementById('distribute-quiz-select');
        if (select) select.value = quiz._id;
        showToast('Select "Local Wi-Fi Transfer" or "Seed via WebTorrent"', 'info');
    }

    async function deleteQuiz(quiz) {
        if (!confirm(`Delete "${quiz.title}"? This cannot be undone.`)) return;
        try {
            await window.quizzesDB.remove(quiz._id, quiz._rev);
            showToast('Quiz deleted', 'info');
            // Broadcast change event to trigger cache and UI updates
            window.dispatchEvent(new CustomEvent('db-changed', { detail: { db: 'offgrid_quizzes' } }));
            loadQuizzes();
        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }

    // ─── Event Delegation for Quiz Cards (Issue #12) ─────────
    const quizList = document.getElementById('quiz-list');
    if (quizList) {
        quizList.addEventListener('click', (e) => {
            const card = e.target.closest('.quiz-card');
            if (!card) return;
            
            const quizId = card.dataset.quizId;
            const quiz = cachedQuizzes.find(q => q._id === quizId);
            if (!quiz) return;

            if (e.target.closest('.edit-btn')) {
                editQuiz(quiz);
            } else if (e.target.closest('.dist-btn')) {
                distributeQuiz(quiz);
            } else if (e.target.closest('.del-btn')) {
                deleteQuiz(quiz);
            }
        });
    }

    // ─── Auto-Scoring ────────────────────────────────────────
    window.autoScoreSubmission = async function (submission) {
        try {
            const quiz = await window.quizzesDB.get(submission.quizId);
            let score = 0;
            const breakdown = [];

            quiz.questions.forEach(q => {
                const studentAnswer = submission.answers[q.id];
                let correct = false;

                if (q.type === 'mcq') {
                    if (q.answerType === 'multi') {
                        const correctSet = (Array.isArray(q.answer) ? [...q.answer] : [q.answer]).sort();
                        const studentSet = (Array.isArray(studentAnswer) ? [...studentAnswer] : (studentAnswer ? [studentAnswer] : [])).sort();
                        correct = JSON.stringify(correctSet) === JSON.stringify(studentSet);
                    } else {
                        correct = studentAnswer === q.answer;
                    }
                    if (correct) score += (q.points || 1);
                } else {
                    // Short answer: flag for manual review, give 0 auto-score
                    correct = null; // null = needs review
                }

                const answerDisplay = Array.isArray(studentAnswer) ? studentAnswer.join(', ') : (studentAnswer || '(no answer)');
                const correctDisplay = Array.isArray(q.answer) ? q.answer.join(', ') : (q.answer || '(short answer)');
                breakdown.push({
                    qId: q.id,
                    qText: q.text,
                    type: q.type,
                    answerType: q.answerType || 'single',
                    correct,
                    studentAnswer: answerDisplay,
                    correctAnswer: correctDisplay,
                    points: q.points || 1
                });
            });

            const totalPoints = quiz.totalPoints;
            const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

            const resultToSave = {
                _id: `result_${submission._id}`,
                type: 'result',
                submissionId: submission._id,
                quizId: submission.quizId,
                quizTitle: quiz.title,
                studentName: submission.studentName,
                studentId: submission.studentId,
                score,
                totalPoints,
                percentage,
                breakdown,
                gradedAt: new Date().toISOString()
            };

            try {
                // If deterministic ID already exists, fetch _rev to update
                const existing = await window.resultsDB.get(resultToSave._id);
                resultToSave._rev = existing._rev;
            } catch (e) { /* new doc, no rev needed */ }

            await window.resultsDB.put(resultToSave);
            console.log('[Teacher] Result saved/updated:', resultToSave._id);

            loadResponses();
            updateStatsCount();
            return result;
        } catch (err) {
            console.error('[Teacher] Scoring error:', err);
        }
    };

    // ─── Background Scorer for Synced Submissions ────────────
    window.processUnscoredSubmissions = async function () {
        console.log('[Teacher] Scanning for unscored submissions...');
        try {
            // 1. Get all submissions
            const subResult = await window.submissionsDB.allDocs({ include_docs: true });
            const submissions = subResult.rows.map(r => r.doc).filter(d => d.type === 'submission');

            // 2. Get all existing results to check what's already scored
            const resResult = await window.resultsDB.allDocs({ include_docs: true });
            const resultIds = new Set(resResult.rows.map(r => r.doc._id));

            let processedCount = 0;

            for (const sub of submissions) {
                const targetResultId = `result_${sub._id}`;
                if (!resultIds.has(targetResultId)) {
                    console.log(`[Teacher] Auto-scoring synced submission: ${sub.studentName} for quiz ${sub.quizId}`);
                    await window.autoScoreSubmission(sub);
                    processedCount++;
                }
            }

            if (processedCount > 0) {
                console.log(`[Teacher] Background scoring complete. Processed ${processedCount} new submissions.`);
                loadResponses();
            }
        } catch (err) {
            console.error('[Teacher] Background scoring error:', err);
        }
    };

    // ─── Startup Cleanup logic for legacy duplicates ─────────
    async function cleanupDuplicateResults() {
        try {
            const res = await window.resultsDB.allDocs({ include_docs: true });
            const docs = res.rows.map(r => r.doc).filter(d => d.type === 'result');
            
            const registry = {}; // key -> latest doc
            const toDelete = [];
            
            // Sort by gradedAt (oldest first) so registry ends up with latest
            docs.sort((a,b) => (a.gradedAt || '').localeCompare(b.gradedAt || '')).forEach(d => {
                // Key by quiz + student (use studentId if exists, otherwise studentName)
                const key = `${d.quizId}_${d.studentId || d.studentName}`;
                if (registry[key]) {
                    toDelete.push(registry[key]);
                }
                registry[key] = d;
            });
            
            if (toDelete.length > 0) {
                console.log(`[Teacher] Cleaning up ${toDelete.length} legacy duplicate results...`);
                await window.resultsDB.bulkDocs(toDelete.map(d => ({ ...d, _deleted: true })));
            }
        } catch (e) {
            console.error('[Teacher] Cleanup error:', e);
        }
    }

    // ─── Responses Tab ───────────────────────────────────────
    // Use PouchDB change listener for results
    function initResultChangeListener() {
        if (window.resultsDB && typeof window.resultsDB.changes === 'function') {
            let isInitialized = false;
            window.resultsDB.changes({
                since: 'now',
                live: true,
                include_docs: true
            }).on('change', () => {
                if (!isInitialized) {
                    isInitialized = true;
                    loadResponses();
                } else {
                    clearTimeout(window.resultChangeTimeout);
                    window.resultChangeTimeout = setTimeout(loadResponses, 300);
                }
            }).on('error', (err) => console.error('[Teacher] Result change listener error:', err));
        }
    }

    async function loadResponses() {
        const list = document.getElementById('responses-list');
        if (!list) return;

        try {
            const filter = document.getElementById('response-filter');
            const filterValue = filter ? filter.value : '';

            const result = await window.resultsDB.allDocs({ include_docs: true });
            let rawResults = result.rows.map(r => r.doc).filter(d => d.type === 'result');

            // Deduplicate: Keep only the latest result for each (studentId + quizId)
            const dedupedMap = {};
            rawResults.sort((a, b) => (a.gradedAt || '').localeCompare(b.gradedAt || '')).forEach(r => {
                const key = `${r.quizId}_${r.studentId || r.studentName}`;
                dedupedMap[key] = r;
            });
            let results = Object.values(dedupedMap);
            cachedResults = results; // Cache for delegated events

            if (filterValue) results = results.filter(r => r.quizId === filterValue);

            document.getElementById('resp-count').textContent = results.length;

            if (results.length === 0) {
                list.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>No responses received yet.</p></div>`;
                responseCardsMap.clear();
                return;
            }

            // Incremental update: Only update/add changed cards
            const currentIds = new Set(responseCardsMap.keys());
            const newIds = new Set(results.map(r => r._id));
            const sortedResults = results.sort((a, b) => b.gradedAt.localeCompare(a.gradedAt));

            // Remove deleted responses
            for (const id of currentIds) {
                if (!newIds.has(id)) {
                    const card = responseCardsMap.get(id);
                    if (card && card.parentNode) card.remove();
                    responseCardsMap.delete(id);
                }
            }

            // Add new or update existing responses
            const fragment = document.createDocumentFragment();
            let addedAny = false;

            sortedResults.forEach(r => {
                if (responseCardsMap.has(r._id)) {
                    // Could update existing card here if needed
                } else {
                    const card = createResponseCard(r);
                    responseCardsMap.set(r._id, card);
                    fragment.appendChild(card);
                    addedAny = true;
                }
            });

            if (addedAny) {
                list.appendChild(fragment);
            }

            // Maintain correct order
            sortedResults.forEach(r => {
                const card = responseCardsMap.get(r._id);
                if (card && card.parentNode) list.appendChild(card);
            });
        } catch (err) {
            console.error('[Teacher] Error loading responses:', err);
        }
    }

    function createResponseCard(result) {
        const div = document.createElement('div');
        div.className = 'response-card';
        div.dataset.resultId = result._id; // Track for delegation and incremental updates

        const scoreClass = result.percentage >= 70 ? 'score-good' : result.percentage >= 40 ? 'score-mid' : 'score-low';

        div.innerHTML = `
            <div class="response-header">
                <div style="display:flex;align-items:center;">
                    <div class="score-circle ${scoreClass}">${result.percentage}%</div>
                    <div>
                        <div style="font-weight:600;font-size:15px;">${esc(result.studentName)}</div>
                        <div style="font-size:12px;color:var(--text2);">
                            ${esc(result.quizTitle)} · ${result.score}/${result.totalPoints} pts ·
                            ${new Date(result.gradedAt).toLocaleString()}
                        </div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="btn btn-ghost btn-sm delete-response-btn" title="Delete Response" style="padding:4px 8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                    <span style="color:var(--text3);font-size:18px;">▾</span>
                </div>
            </div>
            <div class="response-body">
                <table class="breakdown-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Question</th>
                            <th>Student Answer</th>
                            <th>Correct Answer</th>
                            <th>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.breakdown.map((b, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${b.qText ? esc(b.qText.substring(0, 50)) + (b.qText.length > 50 ? '…' : '') : 'N/A'}</td>
                                <td>${esc(b.studentAnswer)}</td>
                                <td>${esc(b.correctAnswer || '(short answer)')}</td>
                                <td>${b.correct === true ? '<span class="correct-ans">✓ Correct</span>'
                : b.correct === false ? '<span class="wrong-ans">✗ Wrong</span>'
                    : '<span style="color:var(--yellow);display:inline-flex;align-items:center;gap:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Review</span>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;

        // Don't attach inline event listeners - use event delegation instead
        return div;
    }

    // ─── Event Delegation for Response Cards (Issue #12) ─────
    const responseList = document.getElementById('responses-list');
    if (responseList) {
        responseList.addEventListener('click', async (e) => {
            // Toggle accordion
            const header = e.target.closest('.response-header');
            if (header) {
                const card = header.closest('.response-card');
                if (card) {
                    const body = card.querySelector('.response-body');
                    if (body) body.classList.toggle('open');
                }
            }

            // Delete response
            if (e.target.closest('.delete-response-btn')) {
                e.stopPropagation();
                const card = e.target.closest('.response-card');
                const resultId = card.dataset.resultId;
                const result = cachedResults.find(r => r._id === resultId);
                
                if (result && confirm(`Are you sure you want to delete the response from ${result.studentName}?`)) {
                    try {
                        const doc = await window.resultsDB.get(resultId);
                        await window.resultsDB.remove(doc);

                        // Also delete the original submission so it doesn't get re-scored
                        if (doc.submissionId) {
                            try {
                                const subDoc = await window.submissionsDB.get(doc.submissionId);
                                await window.submissionsDB.remove(subDoc);
                                console.log('[Teacher] Accompanying submission deleted:', doc.submissionId);
                            } catch (e) {
                                // Submission might already be gone
                            }
                        }

                        showToast('Response deleted successfully.', 'success');
                        window.dispatchEvent(new CustomEvent('db-changed', { detail: { db: 'offgrid_results' } }));
                        loadResponses();
                        updateStatsCount();
                    } catch (err) {
                        console.error('[Teacher] Error deleting response:', err);
                        showToast('Failed to delete response.', 'error');
                    }
                }
            }
        });
    }

    async function updateDistributeSelect() {
        const select = document.getElementById('distribute-quiz-select');
        if (!select) return;
        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d => d.type === 'quiz' && d.isPublished);
            select.innerHTML = '<option value="">– Select a published quiz –</option>' +
                quizzes.map(q => `<option value="${q._id}">${esc(q.title)}</option>`).join('');
        } catch (e) { console.error('[Teacher] Failed to update distribute select:', e); }
    }

    async function updateResponseFilter() {
        const select = document.getElementById('response-filter');
        if (!select) return;
        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d => d.type === 'quiz');
            select.innerHTML = '<option value="">All Quizzes</option>' +
                quizzes.map(q => `<option value="${q._id}">${esc(q.title)}</option>`).join('');
        } catch (e) { console.error('[Teacher] Failed to update response filter:', e); }
    }

    async function updateStatsCount() {
        try {
            // Use cached results count instead of calling allDocs()
            const count = cachedResults.length;
            const el = document.getElementById('stat-responses');
            if (el) el.textContent = count;
        } catch (e) { console.error('[Teacher] Failed to update stats count:', e); }
    }

    // ─── CSV Export ──────────────────────────────────────────
    async function exportResponsesCSV() {
        try {
            // Use cached results instead of allDocs()
            const results = cachedResults;
            if (results.length === 0) { showToast('No responses to export', 'info'); return; }

            const headers = ['Student Name', 'Quiz Title', 'Score', 'Total Points', 'Percentage', 'Graded At'];
            const rows = results.map(r => [
                `"${r.studentName || ''}"`,
                `"${r.quizTitle || ''}"`,
                r.score || 0,
                r.totalPoints || 0,
                (r.percentage || 0) + '%',
                `"${r.gradedAt ? new Date(r.gradedAt).toLocaleString() : ''}"`,
            ]);

            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `offgridlink_results_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('📥 Results exported!', 'success');
        } catch (err) {
            showToast('Export failed: ' + err.message, 'error');
        }
    }

    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportResponsesCSV);

    // ─── PDF Export ──────────────────────────────────────────
    async function exportResponsesPDF() {
        try {
            const { jsPDF } = window.jspdf;
            // Use cached results instead of allDocs()
            const results = cachedResults;
            if (results.length === 0) { showToast('No responses to export', 'info'); return; }

            const doc = new jsPDF();
            doc.setFontSize(20);
            doc.text('OffGridLink - Quiz Results Report', 14, 22);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

            const tableData = results.map((r, i) => [
                i + 1,
                r.studentName || 'N/A',
                r.quizTitle || 'N/A',
                `${r.score}/${r.totalPoints}`,
                `${r.percentage}%`,
                r.gradedAt ? new Date(r.gradedAt).toLocaleDateString() : 'N/A'
            ]);

            doc.autoTable({
                startY: 35,
                head: [['#', 'Student', 'Quiz', 'Score', '%', 'Date']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [245, 158, 11], textColor: 255 },
                alternateRowStyles: { fillColor: [250, 250, 250] }
            });

            doc.save(`offgridlink_results_${new Date().toISOString().split('T')[0]}.pdf`);
            showToast('📄 PDF Report exported!', 'success');
        } catch (err) {
            console.error('[Teacher] PDF Export error:', err);
            showToast('PDF Export failed: ' + err.message, 'error');
        }
    }

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportResponsesPDF);

    // ─── Excel Export ────────────────────────────────────────
    async function exportResponsesExcel() {
        try {
            // Use cached results instead of allDocs()
            const results = cachedResults;
            if (results.length === 0) { showToast('No responses to export', 'info'); return; }

            const worksheetData = [
                ['Student Name', 'Quiz Title', 'Score', 'Total Points', 'Percentage (%)', 'Graded At', 'Submission ID']
            ];

            results.forEach(r => {
                worksheetData.push([
                    r.studentName || 'N/A',
                    r.quizTitle || 'N/A',
                    r.score || 0,
                    r.totalPoints || 0,
                    r.percentage || 0,
                    r.gradedAt ? new Date(r.gradedAt).toLocaleString() : 'N/A',
                    r.submissionId || 'N/A'
                ]);
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(worksheetData);
            XLSX.utils.book_append_sheet(wb, ws, "Quiz Results");

            XLSX.writeFile(wb, `offgridlink_results_${new Date().toISOString().split('T')[0]}.xlsx`);
            showToast('📊 Excel sheet exported!', 'success');
        } catch (err) {
            console.error('[Teacher] Excel Export error:', err);
            showToast('Excel Export failed: ' + err.message, 'error');
        }
    }

    const exportExcelBtn = document.getElementById('export-excel-btn');
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportResponsesExcel);

    // ─── Send Quiz P2P ───────────────────────────────────────
    const sendQuizBtn = document.getElementById('send-quiz-btn');
    if (sendQuizBtn) {
        sendQuizBtn.addEventListener('click', async () => {
            const select = document.getElementById('distribute-quiz-select');
            const quizId = select ? select.value : '';
            if (!quizId) { showToast('Select a quiz to distribute', 'error'); return; }
            if (typeof window.sendQuizToAllStudents === 'function') {
                await window.sendQuizToAllStudents(quizId);
            } else {
                showToast('P2P not ready yet', 'error');
            }
        });
    }

    // ─── Event Listeners ─────────────────────────────────────
    window.addEventListener('submission-received', () => {
        loadResponses();
        
        // Native Desktop Notification (Electron only)
        if (window.electronAPI && window.electronAPI.sendNotification) {
            window.electronAPI.sendNotification('Quiz Submission', 'A new student has submitted their quiz!');
        }
    });
    window.addEventListener('db-changed', e => {
        loadQuizzes();
        loadResponses();
        updateDistributeSelect();
        // If submissions changed, check if any need scoring
        if (e.detail && e.detail.db === 'offgrid_submissions') {
            window.processUnscoredSubmissions();
        }
    });

    // Response filter
    const respFilter = document.getElementById('response-filter');
    if (respFilter) respFilter.addEventListener('change', loadResponses);

    // ─── Init ────────────────────────────────────────────────
    // Start listening to database changes instead of polling
    initQuizChangeListener();
    initResultChangeListener();
    
    loadQuizzes();
    loadResponses();
    updateDistributeSelect();
    updateResponseFilter();
    updateStatsCount();
    
    // Check for unscored submissions on start
    setTimeout(async () => {
        await cleanupDuplicateResults();
        window.processUnscoredSubmissions();
    }, 2000);

    // ─── Electron Specific ───────────────────────────────────
    if (window.electronAPI && window.electronAPI.onLocalIP) {
        window.electronAPI.onLocalIP((ip) => {
            const ipDisplay = document.getElementById('teacher-ip-display');
            if (ipDisplay) {
                ipDisplay.value = ip;
                console.log('[TeacherApp] Received IP from Electron:', ip);
            }
        });
    }
});
