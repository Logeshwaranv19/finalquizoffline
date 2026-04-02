// OffGridLink - Teacher App Logic
// Quiz CRUD, UI rendering, auto-scoring, distribution controls

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
        const q = { id: qId, type, text: '', options: type === 'mcq' ? ['', '', '', ''] : [], answer: '', points: 1 };
        questions.push(q);
        renderQuestion(q, questions.length - 1);
    }

    function renderQuestion(q, index) {
        if (!questionsList) return;

        const div = document.createElement('div');
        div.className = 'question-item';
        div.dataset.qid = q.id;

        const optionsHtml = q.type === 'mcq' ? `
            <div class="form-group" style="margin-top:10px;">
                <label class="form-label">Answer Options & Correct Answer</label>
                <div class="q-options">
                    ${['A', 'B', 'C', 'D'].map((letter, i) => `
                        <div class="q-option-input-row">
                            <span class="q-option-label">${letter}.</span>
                            <input type="text" class="q-option" data-opt="${i}" placeholder="Option ${letter}" value="${q.options[i] || ''}">
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:10px;">
                    <label class="form-label">Correct Answer</label>
                    <select class="q-answer-select">
                        <option value="">– Select –</option>
                        ${['A', 'B', 'C', 'D'].map(l => `<option value="${l}" ${q.answer === l ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>
            </div>` : `
            <div class="form-group" style="margin-top:10px;">
                <label class="form-label">Model Answer (for reference)</label>
                <input type="text" class="q-answer-short" placeholder="Expected answer..." value="${q.answer || ''}">
            </div>`;

        div.innerHTML = `
            <div class="q-num">Question ${index + 1} – ${q.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}</div>
            <button class="remove-q-btn" title="Remove">✕</button>
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
            div.querySelector('.q-answer-select').addEventListener('change', e => { q.answer = e.target.value; });
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
            if (q.type === 'mcq' && !q.answer) { showToast('Select correct answer for all MCQ questions', 'error'); return; }
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
    async function loadQuizzes() {
        const list = document.getElementById('quiz-list');
        if (!list) return;

        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d => d.type === 'quiz');

            document.getElementById('quiz-count').textContent = quizzes.length;
            document.getElementById('stat-total').textContent = quizzes.length;
            document.getElementById('stat-published').textContent = quizzes.filter(q => q.isPublished).length;

            if (quizzes.length === 0) {
                list.innerHTML = `<div class="empty-state"><div class="icon">📚</div><p>No quizzes yet. Go to <strong>Create Quiz</strong> to get started!</p></div>`;
                return;
            }

            list.innerHTML = '';
            quizzes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach(quiz => {
                list.appendChild(createQuizCard(quiz));
            });
        } catch (err) {
            console.error('[Teacher] Error loading quizzes:', err);
        }
    }

    function createQuizCard(quiz) {
        const div = document.createElement('div');
        div.className = 'quiz-card';

        const pill = quiz.isPublished
            ? '<span class="status-pill pill-published">● Published</span>'
            : '<span class="status-pill pill-draft">○ Draft</span>';

        div.innerHTML = `
            <div class="quiz-icon">📝</div>
            <div class="quiz-info">
                <div class="quiz-name">${quiz.title}</div>
                <div class="quiz-meta">
                    ${quiz.subject || 'General'} ·
                    ${quiz.questions.length} questions ·
                    ${quiz.totalPoints} pts ·
                    ${quiz.timeLimit ? quiz.timeLimit + ' min' : 'No limit'}
                    ${pill}
                </div>
            </div>
            <div class="quiz-actions">
                <button class="btn btn-ghost btn-sm edit-btn">✏️ Edit</button>
                <button class="btn btn-primary btn-sm dist-btn">📤 Distribute</button>
                <button class="btn btn-danger btn-sm del-btn">🗑️</button>
            </div>`;

        div.querySelector('.edit-btn').addEventListener('click', () => editQuiz(quiz));
        div.querySelector('.dist-btn').addEventListener('click', () => distributeQuiz(quiz));
        div.querySelector('.del-btn').addEventListener('click', () => deleteQuiz(quiz));

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
            loadQuizzes();
        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
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
                    correct = studentAnswer === q.answer;
                    if (correct) score += (q.points || 1);
                } else {
                    // Short answer: flag for manual review, give 0 auto-score
                    correct = null; // null = needs review
                }

                breakdown.push({
                    qId: q.id,
                    qText: q.text,
                    type: q.type,
                    correct,
                    studentAnswer: studentAnswer || '(no answer)',
                    correctAnswer: q.answer,
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
            } catch (e) { }

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

            if (filterValue) results = results.filter(r => r.quizId === filterValue);

            document.getElementById('resp-count').textContent = results.length;

            if (results.length === 0) {
                list.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>No responses received yet.</p></div>`;
                return;
            }

            list.innerHTML = '';
            results.sort((a, b) => b.gradedAt.localeCompare(a.gradedAt)).forEach(r => {
                list.appendChild(createResponseCard(r));
            });
        } catch (err) {
            console.error('[Teacher] Error loading responses:', err);
        }
    }

    function createResponseCard(result) {
        const div = document.createElement('div');
        div.className = 'response-card';

        const scoreClass = result.percentage >= 70 ? 'score-good' : result.percentage >= 40 ? 'score-mid' : 'score-low';

        div.innerHTML = `
            <div class="response-header">
                <div style="display:flex;align-items:center;">
                    <div class="score-circle ${scoreClass}">${result.percentage}%</div>
                    <div>
                        <div style="font-weight:600;font-size:15px;">${result.studentName}</div>
                        <div style="font-size:12px;color:var(--text2);">
                            ${result.quizTitle} · ${result.score}/${result.totalPoints} pts ·
                            ${new Date(result.gradedAt).toLocaleString()}
                        </div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <button class="btn btn-ghost btn-sm delete-response-btn" title="Delete Response" style="padding:4px 8px;font-size:14px;">🗑️</button>
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
                                <td>${b.qText ? b.qText.substring(0, 50) + (b.qText.length > 50 ? '…' : '') : 'N/A'}</td>
                                <td>${b.studentAnswer}</td>
                                <td>${b.correctAnswer || '(short answer)'}</td>
                                <td>${b.correct === true ? '<span class="correct-ans">✓ Correct</span>'
                : b.correct === false ? '<span class="wrong-ans">✗ Wrong</span>'
                    : '<span style="color:var(--yellow)">📝 Review</span>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;

        const deleteBtn = div.querySelector('.delete-response-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // prevent toggling the accordion
                if (confirm(`Are you sure you want to delete the response from ${result.studentName}?`)) {
                    try {
                        const doc = await window.resultsDB.get(result._id);
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
                        loadResponses();
                        updateStatsCount();
                    } catch (err) {
                        console.error('[Teacher] Error deleting response:', err);
                        showToast('Failed to delete response.', 'error');
                    }
                }
            });
        }

        div.querySelector('.response-header').addEventListener('click', () => {
            const body = div.querySelector('.response-body');
            body.classList.toggle('open');
        });

        return div;
    }

    async function updateDistributeSelect() {
        const select = document.getElementById('distribute-quiz-select');
        if (!select) return;
        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d => d.type === 'quiz' && d.isPublished);
            select.innerHTML = '<option value="">– Select a published quiz –</option>' +
                quizzes.map(q => `<option value="${q._id}">${q.title}</option>`).join('');
        } catch (e) { }
    }

    async function updateResponseFilter() {
        const select = document.getElementById('response-filter');
        if (!select) return;
        try {
            const result = await window.quizzesDB.allDocs({ include_docs: true });
            const quizzes = result.rows.map(r => r.doc).filter(d => d.type === 'quiz');
            select.innerHTML = '<option value="">All Quizzes</option>' +
                quizzes.map(q => `<option value="${q._id}">${q.title}</option>`).join('');
        } catch (e) { }
    }

    async function updateStatsCount() {
        try {
            const result = await window.resultsDB.allDocs({ include_docs: true });
            const count = result.rows.filter(r => r.doc.type === 'result').length;
            const el = document.getElementById('stat-responses');
            if (el) el.textContent = count;
        } catch (e) { }
    }

    // ─── CSV Export ──────────────────────────────────────────
    async function exportResponsesCSV() {
        try {
            const result = await window.resultsDB.allDocs({ include_docs: true });
            const results = result.rows.map(r => r.doc).filter(d => d.type === 'result');
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
            const result = await window.resultsDB.allDocs({ include_docs: true });
            const results = result.rows.map(r => r.doc).filter(d => d.type === 'result');
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
            const result = await window.resultsDB.allDocs({ include_docs: true });
            const results = result.rows.map(r => r.doc).filter(d => d.type === 'result');
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
