// OffGridLink – Electron Main Process
// Starts local PeerJS server + teacher UI window

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { PeerServer } = require('peer');
const os = require('os');

let peerServer = null;
let mainWindow = null;

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
        title: 'OffGridLink – Teacher Dashboard'
    });

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
    await startPeerServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

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
    // Gracefully shut down the peer server
    if (peerServer && typeof peerServer.close === 'function') {
        try {
            peerServer.close();
            console.log('[Main] PeerJS server shut down cleanly.');
        } catch (e) {
            console.warn('[Main] Error shutting down PeerServer:', e.message);
        }
    }
});
