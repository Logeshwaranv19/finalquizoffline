// OffGridLink – Custom Dev Server
// Serves static files from /public AND exposes /api/local-ip
// Run with: node server.js  (used by "npm start")

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
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
    res.setHeader('Cache-Control', 'no-cache');

    // API: return local IP as JSON
    if (req.url === '/api/local-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ip: localIP }));
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
