// OffGridLink - Database Layer
// Three PouchDB databases for full quiz platform

// Factory: creates a fresh PouchDB instance
function createDBs() {
    window.quizzesDB = new PouchDB('offgrid_quizzes');
    window.submissionsDB = new PouchDB('offgrid_submissions');
    window.resultsDB = new PouchDB('offgrid_results');
    window.offGridDB = window.quizzesDB; // legacy compat
}
window.createDBs = createDBs; // expose for retry logic in other modules

// Initialize databases
createDBs();

// Verify all databases are healthy on startup
Promise.all([
    window.quizzesDB.info(),
    window.submissionsDB.info(),
    window.resultsDB.info()
]).then(([q, s, r]) => {
    console.log('[DB] offgrid_quizzes:', q.doc_count, 'docs');
    console.log('[DB] offgrid_submissions:', s.doc_count, 'docs');
    console.log('[DB] offgrid_results:', r.doc_count, 'docs');
}).catch(err => {
    console.error('[DB] Init error — recreating DBs:', err);
    createDBs();
});

// Auto-reinitialize if IndexedDB connection closes unexpectedly
// (happens after page refresh / browser tab reuse)
window.addEventListener('error', function (e) {
    if (e.message && e.message.includes('IDBDatabase')) {
        console.warn('[DB] IDBDatabase error detected — reinitializing databases');
        createDBs();
    }
});

// ─── Quiz Schema ────────────────────────────────────────────
// {
//   _id: 'quiz_<timestamp>',
//   type: 'quiz',
//   title: 'Math Quiz Chapter 3',
//   description: 'Covers algebra basics',
//   subject: 'Mathematics',
//   timeLimit: 30, // minutes (0 = no limit)
//   createdAt: ISO string,
//   createdBy: 'Teacher Name',
//   questions: [
//     {
//       id: 'q1',
//       type: 'mcq' | 'short',
//       text: 'Question text',
//       options: ['A', 'B', 'C', 'D'],  // for MCQ
//       answer: 'A',  // TEACHER ONLY - correct answer
//       points: 1
//     }
//   ],
//   totalPoints: 10,
//   isPublished: false
// }

// ─── Student Quiz Schema (no answers) ──────────────────────
// Same as above but with answer fields stripped

// ─── Submission Schema ──────────────────────────────────────
// {
//   _id: 'sub_<quizId>_<studentId>_<timestamp>',
//   type: 'submission',
//   quizId: 'quiz_<timestamp>',
//   quizTitle: 'Math Quiz Chapter 3',
//   studentId: 'peer-xyz',
//   studentName: 'Student Name',
//   answers: { 'q1': 'A', 'q2': 'B' },
//   submittedAt: ISO string,
//   syncStatus: 'pending' | 'synced',
//   score: null  // filled by teacher after scoring
// }

// ─── Result Schema ──────────────────────────────────────────
// {
//   _id: 'result_<submissionId>',
//   type: 'result',
//   submissionId: 'sub_...',
//   quizId: 'quiz_...',
//   studentName: 'Name',
//   score: 8,
//   totalPoints: 10,
//   percentage: 80,
//   breakdown: [{ qId: 'q1', correct: true, studentAnswer: 'A', correctAnswer: 'A' }],
//   gradedAt: ISO string
// }
