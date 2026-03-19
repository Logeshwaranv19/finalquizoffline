# OffGridLink – CouchDB Setup Guide

> **CouchDB is OPTIONAL** – The platform works 100% offline without it.
> Only configure CouchDB if you want cloud backup and cross-device sync.

---

## 1. Install CouchDB

Download from: **https://couchdb.apache.org/**

- Windows: Download the `.exe` installer
- Run the installer and choose **single node** mode
- Set an **admin username and password** during setup
- CouchDB will run on: `http://localhost:5984`

---

## 2. Auto-Setup Databases

Run the setup script from the project folder:

```bash
# Basic (using defaults: admin / password)
node config_couch.js

# With custom credentials
set COUCH_USER=myadmin
set COUCH_PASS=mypassword
set COUCH_HOST=localhost
node config_couch.js
```

This will create:
| Database | Purpose |
|---|---|
| `offgrid_quizzes` | Quiz definitions |
| `offgrid_submissions` | Student answers |
| `offgrid_results` | Scored results |

---

## 3. Manual Setup (Alternative)

Open **Fauxton** (CouchDB UI) at: `http://localhost:5984/_utils`

1. Create a database named `offgrid_quizzes`
2. Create a database named `offgrid_submissions`
3. Create a database named `offgrid_results`

---

## 4. Enable CORS (Required for Mobile)

In Fauxton → Configuration → CORS:
- Enable CORS ✅
- Origins: `*`
- Credentials: ✅

Or run:
```bash
node config_couch.js
```
(The script enables CORS automatically)

---

## 5. Connect the App

In the **Teacher App** or **Student App**, click the sync indicator in the header:

| Field | Value |
|---|---|
| Server IP | Your laptop's IP on the Wi-Fi (e.g. `192.168.1.100`) |
| Port | `5984` |
| Username | Your CouchDB admin username |
| Password | Your CouchDB admin password |

Click **Save & Connect** → status turns 🟢 **Synced**.

---

## 6. Find Your Laptop IP

```cmd
# Windows
ipconfig
# Look for "IPv4 Address" under your Wi-Fi adapter
```

---

## 7. Firewall (Windows)

CouchDB uses port `5984`. If students can't sync, allow it through Windows Firewall:

```powershell
# Run as Administrator
netsh advfirewall firewall add rule name="CouchDB" dir=in action=allow protocol=TCP localport=5984
```

---

## Network Diagram

```
[Teacher Laptop]
    ├── CouchDB (port 5984) ──→ cloud backup
    ├── PeerJS broker (cloud) → student connections
    └── WebTorrent seeder → LAN quiz distribution

[Student Phones] (same Wi-Fi)
    ├── PeerJS → connect to teacher peer ID
    └── PouchDB → local quiz + answer storage
         └── Optional sync → CouchDB on teacher laptop
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Sync button stays ❌ | Check IP address is correct, CouchDB is running |
| 401 Authentication | Check username/password in app settings |
| 404 Database not found | Run `node config_couch.js` to create databases |
| Mobile can't reach CouchDB | Check firewall, both on same Wi-Fi |
| CORS error in console | Open Fauxton and enable CORS manually |
