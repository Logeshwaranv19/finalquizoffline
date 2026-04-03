// OffGridLink – Electron Main Process
// Starts local PeerJS server + teacher UI window

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const http = require('http');
const { PeerServer } = require('peer');
const { Server: TrackerServer } = require('bittorrent-tracker');
const os = require('os');

let peerServer = null;
let trackerServer = null;
let packageServer = null;
let mainWindow = null;
const FALLBACK_HTTP_PORT = 3000;
const publishedQuizPackages = new Map();

// ─── Get Local Network IP ─────────────────────────────────
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

// ─── Start Local WS Tracker (offline WebTorrent) ─────────
function startTracker() {
    trackerServer = new TrackerServer({ http: false, udp: false, ws: true, stats: false });
    trackerServer.on('error', err => console.error('[Tracker] Error:', err.message));
    trackerServer.listen(8000, '0.0.0.0', () => {
        console.log('[Main] ✅ Local WS tracker running on port 8000');
    });
}

// ─── Start Local HTTP API for Fallback Quiz Download ─────
function startFallbackHttpServer() {
    const localIP = getLocalIP();

    packageServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url === '/api/local-ip') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ip: localIP }));
            return;
        }

        if (req.method === 'GET' && req.url === '/api/tracker-url') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: `ws://${localIP}:8000` }));
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

                    const url = `http://${localIP}:${FALLBACK_HTTP_PORT}/api/quiz-package/${encodeURIComponent(quizId)}`;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, quizId, url }));
                    console.log('[Main] Published HTTP fallback package for quiz:', quizId);
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

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    packageServer.on('error', (err) => {
        console.error('[Main] HTTP fallback server error:', err.message);
    });

    packageServer.listen(FALLBACK_HTTP_PORT, '0.0.0.0', () => {
        console.log(`[Main] ✅ HTTP fallback API running on port ${FALLBACK_HTTP_PORT}`);
    });
}

// ─── Start Local PeerJS Server ────────────────────────────
function startPeerServer() {
    return new Promise((resolve, reject) => {
        try {
            peerServer = PeerServer({ port: 9000, path: '/offgrid' });

            peerServer.on('connection', client => {
                console.log('[PeerServer] Client connected:', client.getId());
            });

            peerServer.on('disconnect', client => {
                console.log('[PeerServer] Client disconnected:', client.getId());
            });

            console.log('[Main] ✅ Local PeerJS server running on port 9000');
            resolve(peerServer);
        } catch (err) {
            console.error('[Main] ❌ Failed to start PeerJS server:', err.message);
            if (err.code === 'EADDRINUSE') {
                console.log('[Main] Port 9000 already in use – peer server may already be running.');
                resolve(null); // Non-fatal: browser app will fall back to public broker
            } else {
                reject(err);
            }
        }
    });
}

// ─── Create Main Window ───────────────────────────────────
function createWindow() {
    const localIP = getLocalIP();
    console.log('[Main] Local IP:', localIP);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        backgroundColor: '#060502',
        show: false,
        fullscreen: false,
        fullscreenable: true,
        resizable: true,
        titleBarStyle: 'default', // Using default to avoid "fullscreen" feel of hidden titlebar
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            spellcheck: true
        },
        icon: path.join(__dirname, 'public/icons/icon.png'),
        title: 'OffGrid Quiz – Teacher Dashboard'
    });

    createMenu();

    mainWindow.loadFile('public/teacher.html');

    // Smoothly show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Send local IP to renderer once page loads
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('local-ip', localIP);
        console.log('[Main] Page loaded – sent local-ip:', localIP);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── App Lifecycle ────────────────────────────────────────
app.whenReady().then(async () => {
    startTracker();
    startFallbackHttpServer();
    await startPeerServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// ─── Menu Configuration ───────────────────────────────────
function createMenu() {
    const template = [
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            role: 'windowMenu'
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Learn More',
                    click: async () => {
                        const { shell } = require('electron');
                        await shell.openExternal('https://github.com/Logeshwaranv19/finalquizoffline');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ─── IPC Handlers ─────────────────────────────────────────
ipcMain.on('send-notification', (event, { title, body }) => {
    // Check if the window is currently focused. If not, show native notification.
    // In a teacher environment, a tray or toast is the user expectation.
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
        new Notification({ 
            title: title || 'OffGridLink', 
            body: body || 'New Update Received',
            icon: path.join(__dirname, 'public/icons/icon.png')
        }).show();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (peerServer && typeof peerServer.close === 'function') {
        try {
            peerServer.close();
            console.log('[Main] PeerJS server shut down cleanly.');
        } catch (e) {
            console.warn('[Main] Error shutting down PeerServer:', e.message);
        }
    }
    if (trackerServer && typeof trackerServer.close === 'function') {
        try {
            trackerServer.close();
            console.log('[Main] Tracker shut down cleanly.');
        } catch (e) {
            console.warn('[Main] Error shutting down Tracker:', e.message);
        }
    }
    if (packageServer && typeof packageServer.close === 'function') {
        try {
            packageServer.close();
            console.log('[Main] HTTP fallback server shut down cleanly.');
        } catch (e) {
            console.warn('[Main] Error shutting down HTTP fallback server:', e.message);
        }
    }
});
