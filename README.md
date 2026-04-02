# OffGridLink - Offline Quiz Distribution System

## 📋 Description

**OffGridLink** is an innovative offline-first quiz management and distribution system designed for educational environments without reliable internet connectivity. Teachers can create, manage, and distribute quizzes to students via peer-to-peer networking over local Wi-Fi networks. Students submit their responses which are automatically scored and synced when connectivity is available.

The application leverages **Progressive Web App (PWA)** technologies and **Electron** to run seamlessly on both web browsers and desktop platforms, making it accessible in low-connectivity scenarios.

---

## 🎬 Demo / Screenshot
Teacher's Laptop
<img width="1565" height="952" alt="Screenshot 2026-04-02 214505" src="https://github.com/user-attachments/assets/9c41810f-a271-4449-aff4-ed9a19ca1552" />

<img width="1546" height="929" alt="Screenshot 2026-04-02 214517" src="https://github.com/user-attachments/assets/86a45f36-4e6d-4c94-90f9-8000cfe5961e" />

<img width="1541" height="915" alt="Screenshot 2026-04-02 214531" src="https://github.com/user-attachments/assets/f5d21546-a69c-4e1b-aa4c-9a7afd7ee9d5" />

<img width="1919" height="1112" alt="Screenshot 2026-04-02 214552" src="https://github.com/user-attachments/assets/671d30e0-13ae-484c-8b3a-5b633d51e912" />

<img width="1917" height="1114" alt="Screenshot 2026-04-02 214619" src="https://github.com/user-attachments/assets/5eb8e257-33c3-406f-b63a-215abe042ae9" />

Student's phone
![1](https://github.com/user-attachments/assets/b7225aea-96d7-420c-bdc9-2b51014517d1)

![2 1](https://github.com/user-attachments/assets/dad92e5e-11be-4883-b7fd-d62bea38d1ef)

![2](https://github.com/user-attachments/assets/12993ec3-0bf2-4193-b4a5-d4bcac1fc95f)

![mk](https://github.com/user-attachments/assets/981c0454-892a-479c-ae4e-0f5cdda0d89e)




```
[Teacher Dashboard]
├── Create Quiz Tab
├── My Quizzes Tab
├── Responses Tab
├── Statistics & Analytics
└── P2P Distribution Controls

[Student App]
├── Available Quizzes
├── Quiz Navigation
├── Answer Submission
└── Offline Sync
```

---

## ✨ Features

### Core Functionality
- ✅ **Offline-First Architecture** - Works completely without internet using local PouchDB storage
- ✅ **Quiz Management** - Create, edit, publish, and delete quizzes with rich question types
- ✅ **MCQ & Short Answer Support** - Multiple choice (single/multiple correct) and short answer questions
- ✅ **Auto-Scoring** - Instant scoring for MCQ submissions with manual review for short answers
- ✅ **P2P Distribution** - Share quizzes directly between devices on same LAN via WebRTC and WebTorrent
- ✅ **Real-Time Responses** - Live student response tracking with instant notification

### Performance Optimizations
- ⚡ **Incremental DOM Updates** - Only updates changed quiz/response cards instead of full rebuild
- ⚡ **Quiz Cache Management** - Capped cache (100 quizzes max) to prevent memory bloat
- ⚡ **Batched Database Queries** - Reduces allDocs() calls via PouchDB change listeners and caching
- ⚡ **Event Delegation** - Single delegated listener per container instead of per-element listeners

### Additional Features
- 📊 **Analytics Dashboard** - View statistics on quiz performance and student engagement
- 📥 **Multi-Format Export** - Export results as CSV, PDF, or Excel
- 🔐 **Data Privacy** - All data stored locally; no cloud dependency
- 🌐 **Cross-Platform** - Web app, Electron desktop, or mobile-responsive web
- 🎨 **Responsive UI** - Modern interface built with Tailwind CSS

---

## 🛠️ Tech Stack

### Frontend
- **HTML5 & Vanilla JavaScript** - No heavy frameworks, lightweight and fast
- **Tailwind CSS** - Utility-first responsive styling
- **Service Workers** - PWA offline support and caching

### Backend & Database
- **PouchDB** - Local in-browser/LevelDB database
- **CouchDB** - Optional remote sync server
- **Node.js / Express** - Development server and utilities

### Networking & Desktop
- **WebRTC** - Peer-to-peer data transfer via DataChannels
- **PeerJS** - Abstraction layer for WebRTC connections
- **WebTorrent** - Alternative P2P distribution method
- **Electron** - Cross-platform desktop application wrapper

### Build & Utilities
- **npm** - Dependency management
- **Capacitor** - Cross-platform mobile compilation
- **jsPDF & XLSX** - Document generation for exports

---

## 🏗️ Architecture

### System Design
```
┌─────────────────────────────────────────────────────────────┐
│                   OffGridLink System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌──────────────────┐          │
│  │  Teacher App    │         │  Student App     │          │
│  ├─────────────────┤         ├──────────────────┤          │
│  │ • Quiz Creator  │         │ • Quiz Taker     │          │
│  │ • Distribution  │         │ • Answer Submit  │          │
│  │ • Responses     │         │ • Offline Sync   │          │
│  │ • Analytics     │         └──────────────────┘          │
│  └────────┬────────┘                  ▲                     │
│           │                           │                     │
│           └──────────P2P Network──────┘                     │
│              (WebRTC/WebTorrent)                            │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │         Local PouchDB Databases              │          │
│  ├──────────────────────────────────────────────┤          │
│  │ • offgrid_quizzes                            │          │
│  │ • offgrid_submissions                        │          │
│  │ • offgrid_results                            │          │
│  │ • offgrid_sync                               │          │
│  └──────────────────────────────────────────────┘          │
│                      ▲                                      │
│                      │ (Optional Sync)                      │
│                      ▼                                      │
│          ┌──────────────────────┐                          │
│          │  CouchDB Server      │                          │
│          │  (Remote Backup)     │                          │
│          └──────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Key Components
- **teacher-app.js** - Quiz CRUD operations, response management, analytics
- **teacher-peerjs.js** - P2P networking, student connections, quiz broadcasting
- **student-app.js** - Quiz retrieval, answer submission, offline storage
- **sync.js** - Database synchronization with CouchDB
- **db.js** - PouchDB initialization and management

---

## 📦 Installation

### Prerequisites
- **Node.js** v14 or higher
- **npm** v6 or higher
- **CouchDB** (optional, for remote sync)

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Logeshwaranv19/finalquizoffline.git
   cd finalquizoffline
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure CouchDB (optional):**
   - Edit `config_couch.js` with your CouchDB credentials
   - Or run local CouchDB: `docker run -d -p 5984:5984 couchdb`

4. **Verify installation:**
   ```bash
   npm run dev
   ```

---

## 🚀 Usage

### Running the Application

#### Web Mode (Browser)
```bash
npm run dev
```
- Opens at `http://localhost:8080`
- Access as teacher or student via respective tabs

#### Desktop Mode (Electron)
```bash
npm run electron
```
- Launches native desktop application (Windows/macOS/Linux)

#### Android App (Capacitor)
```bash
npm run build
npx cap sync android
npx cap open android
```

### Testing P2P Locally

⚠️ **Important:** Electron locks the database file, so running two Electron instances will crash.

**Correct way to test P2P locally:**

1. **Terminal 1** - Start Electron:
   ```bash
   npm run electron
   ```

2. **Terminal 2** - Start Web Dev Server:
   ```bash
   npm run dev
   ```

3. Open browser to `http://localhost:8080`

4. In both apps, navigate to P2P Connect tab and establish connection

5. Try distributing a quiz from Electron to web browser

---

## 📁 Folder Structure

```
finalquizoffline/
├── public/                          # Static assets & web app
│   ├── index.html                  # Main HTML entry point
│   ├── teacher.html                # Teacher-specific interface
│   ├── manifest.json               # PWA manifest
│   ├── service-worker.js           # Offline caching
│   └── src/                        # Application source
│       ├── teacher-app.js          # Teacher quiz management
│       ├── teacher-peerjs.js       # P2P networking logic
│       ├── student-app.js          # Student quiz interface
│       ├── student-peerjs.js       # Student sync/networking
│       ├── student-webtorrent.js   # WebTorrent integration
│       ├── teacher-webtorrent.js   # Teacher distribution
│       ├── db.js                   # Database initialization
│       └── sync.js                 # CouchDB synchronization
│
├── android/                         # Capacitor Android build
│   ├── app/
│   ├── build.gradle
│   └── ...
│
├── dist/                            # Build output
├── node_modules/                    # Dependencies
├── main.js                          # Electron main process
├── preload.js                       # Electron preload script
├── server.js                        # Development server
├── package.json                     # Project metadata
├── capacitor.config.json            # Capacitor configuration
├── config_couch.js                  # CouchDB configuration
└── README.md                        # This file
```

---

## 🚀 Future Improvements

### Planned Features
- [ ] **Advanced Analytics** - Heatmaps, time-based performance tracking
- [ ] **Question Bank** - Reusable question library with tagging
- [ ] **Timed Quizzes** - Built-in timer with auto-submission
- [ ] **Student Profiles** - Track individual student progress
- [ ] **Randomized Questions** - Shuffle question/option order
- [ ] **Media Support** - Embed images/videos in questions
- [ ] **Bulk Operations** - Import quizzes via CSV/JSON
- [ ] **Mobile Optimization** - Dedicated mobile UI for students
- [ ] **Dark Mode** - Theme support for reduced eye strain
- [ ] **Multi-Language** - Internationalization support

### Performance Roadmap
- Optimize PouchDB indices for faster queries
- Implement virtual scrolling for large result lists
- Add compression for P2P data transfers
- Implement LRU cache eviction policies

### Security Enhancements
- End-to-end encryption for sensitive data
- Teacher authentication and student access codes
- Audit logs for all quiz modifications
- Data integrity verification

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m '✨ Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request with detailed description

### Code Style
- Use vanilla JavaScript (ES6+)
- Follow existing naming conventions
- Add comments for complex logic
- Test P2P features with multiple devices/instances

---

## 📄 License

This project is licensed under the **ISC License** - see details below:

```
ISC License (ISC)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 📞 Support

For issues, questions, or suggestions:
- Open an [Issue](https://github.com/Logeshwaranv19/finalquizoffline/issues)
- Check existing discussions for solutions
- Review [troubleshooting guide](./docs/troubleshooting.md) (coming soon)

---

## 🙏 Acknowledgments

- **PouchDB** & **CouchDB** communities for excellent database solutions
- **Electron** team for cross-platform capabilities
- **WebRTC** and **PeerJS** for P2P connectivity
- Tailwind CSS for modern styling

---

**Made with ❤️ by the OffGridLink Team**
