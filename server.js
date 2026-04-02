// OffGridLink – Custom Dev Server
// Serves static files from /public AND exposes /api/local-ip
// Run with: node server.js  (used by "npm start")

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Server: TrackerServer } = require('bittorrent-tracker');
const { PeerServer } = require('peer');

const PORT = 3000;
const TRACKER_PORT = 8000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── Get real local network IP ────────────────────────────
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const localIP = getLocalIP();
const publishedQuizPackages = new Map();

// ─── Local PeerJS Signaling Server (LAN P2P) ─────────────
const peerServer = PeerServer({ port: 9000, path: '/offgrid', allow_discovery: true });
peerServer.on('connection', client => console.log('[PeerJS Server] Client connected:', client.getId()));
peerServer.on('disconnect', client => console.log('[PeerJS Server] Client disconnected:', client.getId()));
console.log('[PeerJS Server] ✅ Signaling server running on port 9000 (path: /offgrid)');

// ─── Local WebSocket Tracker (offline WebTorrent) ─────────
const tracker = new TrackerServer({ http: false, udp: false, ws: true, stats: false });
tracker.on('error', err => console.error('[Tracker] Error:', err.message));
tracker.listen(TRACKER_PORT, '0.0.0.0', () => {
    console.log(`[Tracker] ✅ WS tracker running on port ${TRACKER_PORT}`);
});

// ─── MIME types ───────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff2':'font/woff2',
    '.woff': 'font/woff',
    '.ttf':  'font/ttf',
};

// ─── HTTP Server ──────────────────────────────────────────
const server = http.createServer((req, res) => {
    // CORS headers (for PeerJS + student pages)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API: return local IP as JSON
    if (req.url === '/api/local-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ip: localIP }));
        return;
    }

    // API: return local tracker URL for offline WebTorrent
    if (req.url === '/api/tracker-url') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: `ws://${localIP}:${TRACKER_PORT}` }));
        return;
    }

    if (req.method === 'POST' && req.url === '/api/publish-quiz-package') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 5 * 1024 * 1024) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too large' }));
                req.destroy();
            }
        });

        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const quizId = payload.quizId;
                const quizPackage = payload.package;

                if (!quizId || !quizPackage || !quizPackage.quiz) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'quizId and package.quiz are required' }));
                    return;
                }

                publishedQuizPackages.set(quizId, {
                    package: quizPackage,
                    updatedAt: new Date().toISOString()
                });

                const url = `http://${localIP}:${PORT}/api/quiz-package/${encodeURIComponent(quizId)}`;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, quizId, url }));
                console.log('[HTTP Fallback] Published package for quiz:', quizId);
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON', details: err.message }));
            }
        });
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/quiz-package/')) {
        const quizId = decodeURIComponent(req.url.slice('/api/quiz-package/'.length));
        const record = publishedQuizPackages.get(quizId);
        if (!record) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Quiz package not found', quizId }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ quizId, package: record.package, updatedAt: record.updatedAt }));
        return;
    }

    // Static file serving
    let urlPath = req.url.split('?')[0]; // strip query string
    if (urlPath === '/' || urlPath === '') urlPath = '/teacher.html';

    const filePath = path.join(PUBLIC_DIR, urlPath);

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            // 404
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + urlPath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': mimeType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║       OffGridLink Dev Server Ready        ║');
    console.log('╠═══════════════════════════════════════════╣');
    console.log(`║  Teacher : http://localhost:${PORT}/teacher.html`);
    console.log(`║  Student : http://localhost:${PORT}/index.html`);
    console.log(`║  Local IP: ${localIP}`);
    console.log(`║  API     : http://localhost:${PORT}/api/local-ip`);
    console.log('╚═══════════════════════════════════════════╝\n');
    console.log(`📡 Students on the same Wi-Fi should connect to: ${localIP}`);
});
