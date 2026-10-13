# 🎙️ Talkity — Voice-to-Text Dictation Platform

> **Speak naturally. Talkity listens, transcribes, and polishes your words in real time with zero limits.**

Talkity is a modern, real-time voice dictation platform and companion Windows desktop application. It captures acoustic audio, transcribes it with high precision across accents (including Indian English and Hindi), polishes grammar and formatting, and seamlessly injects output into your favorite apps.

---

## ✨ Features

- 🎤 **Real-Time Speech Recognition** — Instantaneous client-side and cloud transcription powered by Web Speech API and Groq/OpenAI Whisper.
- 🔄 **Fresh Page on Refresh** — Every time the website refreshes, past session history is automatically cleared and resets into a clean, distraction-free playground.
- 🌐 **Multi-Language & Accent Optimized** — Native support for English (India), English (US), English (UK), and Hindi / Hinglish.
- ✍️ **Intelligent AI Text Polish** — Automatically eliminates vocal fillers (*um*, *uh*, *you know*), cleans punctuation, and normalizes casing.
- 🎨 **Multi-Tone Adaptation** — Switch between Clean Natural, Punchy Concise, Executive Professional, AI Prompt Engineer, and Developer Code comments.
- 🧪 **Interactive App Sandboxes** — Test real-time dictation directly into simulated Slack, VS Code, Gmail, and Document note editors.
- 📖 **Custom Vocabulary & Dictionary** — Define personal phrases, jargon, and shorthand with automated auto-correction replacements.
- 📋 **Zero-Friction Clipboard** — Auto-copy to clipboard and simulated active window paste (`Ctrl+V`).
- 🖥️ **Windows Desktop Companion HUD** — Floating pill overlay (`Talkity.exe`) with global hotkey (`F8`) dictation.
- 🌙 **Dark-Mode Modern UI** — Sleek responsive interface with real-time audio spectrum visualization.

---

## 🚀 Getting Started

### Prerequisites

- **[Node.js](https://nodejs.org/)** (v16 or higher)
- **Google Chrome** or Microsoft Edge (recommended for Web Speech API)

### 1. Clone the Repository

```bash
git clone git@github.com:projectomega2777/talkity.git
cd talkity
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Launch the Server

```bash
node server.js
```

The server will be accessible at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🎯 How to Use

1. Navigate to `http://localhost:3000` in Google Chrome.
2. Select your language from the control bar dropdown (e.g., **English (India)** or **English (US)**).
3. Click **Start Dictating** or tap the <kbd>Space</kbd> bar.
4. Speak naturally into your microphone.
5. Hit **Finish Dictating** to polish and automatically copy the output to your clipboard!
6. Want a fresh start? Simply **refresh the page** (F5 / Ctrl+R) — history is automatically cleared and all inputs reset to fresh.

---

## 🖥️ Windows Desktop HUD App (`Talkity.exe`)

Talkity comes with a dedicated Windows desktop companion app located in `desktop/` and directly downloadable from the website (`/downloads/Talkity.exe`).

### Desktop App Features
- **Global Hotkey:** Press <kbd>F8</kbd> anywhere in Windows to start recording; press <kbd>F8</kbd> again to finish.
- **HUD Pill:** Floating always-on-top status pill displays current recording state.
- **Auto-Paste:** Automatically restores your clipboard and types the polished transcript into whatever app currently has focus.

To compile or run the desktop app:
```powershell
# Compile C# source using the built-in .NET compiler:
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:Talkity.exe desktop/TalkityApp.cs
```

---

## 📁 Repository Structure

```
talkity/
├── server.js              # Express + WebSocket backend server
├── package.json           # Node.js dependencies and scripts
├── desktop/
│   ├── TalkityApp.cs      # C# source code for Windows HUD overlay
│   └── talkity_desktop.py # Python alternative desktop client
├── public/
│   ├── index.html         # Web application UI
│   ├── app.js             # Client speech engine & UI controller
│   ├── styles.css         # Dark theme styling & audio visualizer
│   └── downloads/
│       └── Talkity.exe    # Precompiled Windows executable
├── data/
│   ├── dictionary.json    # Custom vocabulary replacement rules
│   └── history.json       # Local dictation history
└── README.md              # Project documentation
```

---

## 🔌 REST & WebSocket API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/transcribe` | Upload WAV audio buffer for Whisper transcription |
| `POST` | `/api/polish` | Transform raw text with selected tone & custom vocabulary |
| `GET`  | `/api/history` | Retrieve saved transcriptions |
| `POST` | `/api/history` | Store transcription record |
| `DELETE`| `/api/history` | Clear all past session transcriptions |
| `GET`  | `/api/dictionary` | List custom replacement dictionary |
| `POST` | `/api/dictionary` | Add new phrase replacement rule |
| `DELETE`| `/api/dictionary/:id` | Remove a rule from dictionary |
| `WS`   | `ws://localhost:3000` | Real-time bridge between Web UI and Desktop HUD |

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express, WebSocket (`ws`), dotenv
- **Frontend:** Vanilla JavaScript (ES6+), Web Audio API, Web Speech API, HTML5 Canvas
- **Desktop:** C# (.NET Framework 4.0 Win32 APIs: `SetWindowsHookEx`, `SendInput`, `mciSendString`)
- **ASR & AI:** Web Speech API, Groq Cloud Whisper, OpenAI Whisper

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 👤 Author

Developed by **[projectomega2777](https://github.com/projectomega2777)**
