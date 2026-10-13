# 🎙️ Talkity — Voice-to-Text Dictation Platform

**Talkity** is a real-time voice dictation web application that converts your speech into polished, editable text — right in your browser. No sign-up required, no API keys needed for basic use.

> Speak naturally. Talkity listens, transcribes, and polishes your words instantly.

---

## ✨ Features

- 🎤 **Real-Time Speech Recognition** — Uses the Web Speech API for instant, accurate transcription directly in your browser
- 🌐 **Multi-Language Support** — English (India), English (US), English (UK), Hindi, and more
- ✍️ **AI Text Polishing** — Cleans up grammar, punctuation, and formatting automatically
- 📋 **One-Click Copy** — Copy raw or polished text to clipboard instantly
- 📜 **Dictation History** — All your past transcriptions saved and searchable
- 📖 **Custom Dictionary** — Add your own words, jargon, or names for better accuracy
- ⚙️ **Configurable Settings** — Choose speech engine, language, and polish level
- 🖥️ **Desktop App** — Optional Windows overlay app (HUD pill) with global hotkey support
- 🌙 **Dark Mode UI** — Clean, modern interface that's easy on the eyes
- 📱 **Responsive Design** — Works on desktop, tablet, and mobile browsers

---

## 🚀 Quick Start

### Prerequisites

- **[Node.js](https://nodejs.org/)** v16 or higher
- **Google Chrome** (recommended for best speech recognition support)

### Installation

```bash
# 1. Clone this repository
git clone https://github.com/projectomega2777/talkity.git

# 2. Navigate to the project folder
cd talkity

# 3. Install dependencies (already included, but just in case)
npm install

# 4. Start the server
node server.js
```

### Usage

1. Open your browser and go to **[http://localhost:3000](http://localhost:3000)**
2. Select your preferred language from the dropdown
3. Click the **🎤 Start Recording** button
4. Speak naturally — your words appear in real-time
5. Click **Stop** to finalize the transcription
6. Use **Polish** to clean up grammar and formatting
7. Click **Copy** to paste anywhere

---

## 🏗️ Project Structure

```
talkity/
├── server.js              # Express + WebSocket backend server
├── package.json           # Node.js project configuration
├── public/
│   ├── index.html         # Main web interface
│   ├── app.js             # Frontend JavaScript (speech recognition, UI logic)
│   ├── styles.css         # Dark-mode responsive styling
│   └── downloads/
│       └── Talkity.exe    # Windows desktop app download
├── data/
│   ├── history.json       # Saved dictation history
│   └── dictionary.json    # Custom dictionary entries
└── README.md              # This file
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/transcribe` | Upload audio file for transcription |
| `POST` | `/api/polish` | Polish raw text with AI |
| `GET`  | `/api/history` | Retrieve dictation history |
| `POST` | `/api/history` | Save a new dictation entry |
| `GET`  | `/api/dictionary` | Get custom dictionary words |
| `POST` | `/api/dictionary` | Add a word to the dictionary |
| `GET`  | `/api/settings` | Get app settings |
| `POST` | `/api/settings` | Update app settings |

---

## 🖥️ Desktop App (Windows)

Talkity includes an optional Windows desktop companion app:

- **Global Hotkey** (F8) — Press to start/stop recording from any app
- **HUD Overlay** — Small floating pill shows recording status
- **Auto-Paste** — Transcribed text is automatically pasted into your active window

Download `Talkity.exe` from the website or find it in the `public/downloads/` folder.

> **Note:** The desktop app requires the web server to be running (`node server.js`).

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Real-time | WebSocket (ws) |
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Speech | Web Speech API (browser), Whisper (optional) |
| Desktop | C# (.NET Framework 4.0) |

---

## 📋 Requirements

- **OS:** Windows 10/11 (for desktop app), any OS (for web)
- **Browser:** Google Chrome (recommended), Edge, Firefox
- **Node.js:** v16+

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👨‍💻 Author

**projectomega2777**

---

<p align="center">
  Made with ❤️ and 🎤
</p>
