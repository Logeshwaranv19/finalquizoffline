# OffGridLink

**OffGridLink** is an offline-first Peer-to-Peer (P2P) file sharing application designed to work without internet access. It leverages **Progressive Web App (PWA)** technologies and **Electron** to run on both browsers and desktops.

## Features
- **Offline-First:** Works completely without an internet connection using local PouchDB storage.
- **P2P File Transfer:** Share files directly between devices on the same local network (LAN) via WebRTC.
- **Cross-Platform:** Runs as a Web App or a native Desktop App (Windows/Linux/macOS).
- **Data Sync:** Automatically syncs metadata with a local/remote CouchDB server when online.
- **Premium UI:** Modern, responsive interface built with Tailwind CSS.

## Prerequisites
- **Node.js**: Required to run the development server and Electron.
- **CouchDB**: (Optional) Required if you want to test database synchronization.

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Logeshwaranv19/offlinkshare.git
   cd offgridlink
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

### 1. Web Mode (Browser)
Run the app as a standard web application:
```bash
npm run dev
```
Open `http://localhost:8080` in your browser.

### 2. Desktop Mode (Electron)
Run the app as a standalone desktop application:
```bash
npm run electron
```

## ⚠️ Important: Testing P2P Locally
Testing Peer-to-Peer features on a **single computer** requires special care because Electron apps lock the local database file.

**DO NOT** run two Electron windows at the same time to test P2P. They will crash.

**Correct Way to Test P2P Locally:**
1. Open **Terminal 1**: Run `npm run electron` (Desktop App).
2. Open **Terminal 2**: Run `npm run dev` (Web App).
3. Open your browser to `http://localhost:8080`.
4. Click **"P2P Connect"** in both apps to exchange files.

## Architecture
- **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS (Local).
- **Database**: PouchDB (Local In-Browser/LevelDB) syncing to CouchDB.
- **Networking**: WebRTC (Data Channels) for file transfer; No public STUN servers used (LAN only).
- **Desktop Wrapper**: Electron.

## License
ISC
