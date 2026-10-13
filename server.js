const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const IS_VERCEL = !!(process.env.VERCEL || process.env.NOW_REGION || process.env.LAMBDA_TASK_ROOT);

// Setup Data Storage (Safe for Local & Vercel Read-Only Environments)
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'talkity-data') : path.join(__dirname, 'data');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  // Silent fallback to in-memory on restricted filesystems
}

const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const DICTIONARY_FILE = path.join(DATA_DIR, 'dictionary.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// In-Memory Storage Fallbacks
let inMemoryHistory = [];
let inMemoryDictionary = [
  { phrase: "talkity", replacement: "Talkity" },
  { phrase: "antigravity", replacement: "Antigravity" },
  { phrase: "pi yush", replacement: "Piyush" },
  { phrase: "ui automation", replacement: "UI Automation" }
];
let inMemorySettings = {
  groqApiKey: process.env.GROQ_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  language: 'en-IN',
  autoCopy: true,
  soundChimes: true
};

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    // If filesystem is read-only, keep in memory
  }
}

// Initialize default files safely if writable
if (!fs.existsSync(HISTORY_FILE)) {
  writeJSON(HISTORY_FILE, []);
}

if (!fs.existsSync(DICTIONARY_FILE)) {
  writeJSON(DICTIONARY_FILE, inMemoryDictionary);
}

function getSettings() {
  const disk = readJSON(SETTINGS_FILE, null);
  if (disk) return disk;
  return inMemorySettings;
}

function saveSettings(settings) {
  inMemorySettings = { ...inMemorySettings, ...settings };
  writeJSON(SETTINGS_FILE, inMemorySettings);
}

app.use(cors());

// Raw body parser for audio uploads (handles both /api/transcribe and /transcribe)
app.use('/api/transcribe', express.raw({ type: '*/*', limit: '50mb' }));
app.use('/transcribe', express.raw({ type: '*/*', limit: '50mb' }));

app.use(express.json({ limit: '50mb' }));

// Static file serving
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// WebSocket setup (Enabled in local server mode, bypassed in serverless)
const clients = new Set();
let desktopClient = null;

if (!IS_VERCEL) {
  try {
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      clients.add(ws);
      ws.send(JSON.stringify({ type: 'connected', message: 'Talkity WebSocket connected' }));

      ws.on('message', (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data.type === 'register_desktop') {
            desktopClient = ws;
            console.log('💻 Desktop Daemon registered via WebSocket');
            broadcast({ type: 'desktop_status', connected: true });
          }

          // Broadcast to all other clients
          for (const client of clients) {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify(data));
            }
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      });

      ws.on('close', () => {
        clients.delete(ws);
        if (desktopClient === ws) {
          desktopClient = null;
          broadcast({ type: 'desktop_status', connected: false });
        }
      });
    });
  } catch (e) {
    console.warn('WebSocket init skipped:', e.message);
  }
}

function broadcast(event) {
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(event));
    }
  }
}

// Built-in Contextual Polisher
function ruleBasedPolish(text, tone = 'clean', dictionary = []) {
  if (!text) return '';
  let result = text.trim();

  // 1. Apply custom dictionary replacements
  for (const item of dictionary) {
    if (item.phrase && item.replacement) {
      const regex = new RegExp(`\\b${item.phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
      result = result.replace(regex, item.replacement);
    }
  }

  // 2. Remove filler words safely
  const fillers = [
    /\b(um|uh|erm|er|ah)\b,?\s*/gi,
    /\b(you know|basically|so yeah)\b,?\s*/gi
  ];
  for (const f of fillers) {
    result = result.replace(f, ' ');
  }

  result = result.replace(/\s+/g, ' ').trim();

  // 3. Tone transformations
  if (tone === 'concise') {
    result = result
      .replace(/\bi wanted to say that\b/gi, '')
      .replace(/\bplease make sure that you\b/gi, 'Please')
      .trim();
  } else if (tone === 'professional') {
    result = result
      .replace(/\bgonna\b/gi, 'going to')
      .replace(/\bwanna\b/gi, 'want to')
      .replace(/\bthanks\b/gi, 'Thank you');
  } else if (tone === 'prompt') {
    result = `Task: ${result}\nRequirements:\n- Output clean and concise response.\n- Provide step-by-step reasoning.`;
    return result;
  } else if (tone === 'code') {
    return `// ${result}`;
  }

  // 4. Smart Capitalization & Punctuation
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
    if (!/[.!?]$/.test(result) && tone !== 'code') {
      result += '.';
    }
  }

  return result;
}

// API Router — mounted at both '/api' and '/' for maximum deployment flexibility
const api = express.Router();

// GET /settings
api.get('/settings', (req, res) => {
  res.json(getSettings());
});

// POST /settings
api.post('/settings', (req, res) => {
  const current = getSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);
  res.json({ success: true, settings: updated });
});

// POST /transcribe
api.post('/transcribe', async (req, res) => {
  const settings = getSettings();
  const groqKey = req.headers['x-groq-key'] || settings.groqApiKey || process.env.GROQ_API_KEY;
  const openaiKey = req.headers['x-openai-key'] || settings.openaiApiKey || process.env.OPENAI_API_KEY;

  const audioBuffer = req.body;
  if (!audioBuffer || audioBuffer.length < 500) {
    return res.status(400).json({ error: 'No audio data received or recording was too short.' });
  }

  // 1. Groq Whisper (Ultra-low latency ~150ms, near 100% accuracy)
  if (groqKey) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
      formData.append('model', 'whisper-large-v3');
      formData.append('temperature', '0');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = (data.text || '').trim();
        const dict = readJSON(DICTIONARY_FILE, inMemoryDictionary);
        const formatted = ruleBasedPolish(rawText, 'clean', dict);

        return res.json({
          text: rawText,
          formattedText: formatted,
          provider: 'groq-whisper-large-v3'
        });
      }
    } catch (err) {
      console.error('Groq transcription error:', err.message);
    }
  }

  // 2. OpenAI Whisper
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
      formData.append('model', 'whisper-1');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = (data.text || '').trim();
        const dict = readJSON(DICTIONARY_FILE, inMemoryDictionary);
        const formatted = ruleBasedPolish(rawText, 'clean', dict);
        return res.json({
          text: rawText,
          formattedText: formatted,
          provider: 'openai-whisper'
        });
      }
    } catch (err) {
      console.error('OpenAI transcription error:', err.message);
    }
  }

  return res.status(400).json({
    error: 'No Whisper API key configured. Use browser Web Speech or add Groq API key in Settings.',
    hint: 'Groq provides free Whisper requests with instant setup at console.groq.com'
  });
});

// POST /polish
api.post('/polish', async (req, res) => {
  const { rawText, context = '', tone = 'clean', dictionary = [] } = req.body;
  const settings = getSettings();
  const apiKey = req.headers['x-groq-key'] || settings.groqApiKey || process.env.GROQ_API_KEY || req.headers['x-openai-key'] || settings.openaiApiKey || process.env.OPENAI_API_KEY;

  const userDictionary = dictionary.length ? dictionary : readJSON(DICTIONARY_FILE, inMemoryDictionary);

  if (!rawText) {
    return res.status(400).json({ error: 'rawText is required' });
  }

  if (apiKey) {
    try {
      const isGroq = !!(req.headers['x-groq-key'] || settings.groqApiKey || process.env.GROQ_API_KEY);
      const url = isGroq 
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

      const promptToneMap = {
        clean: "Clean up raw dictation: remove filler words (um, uh, like), fix punctuation, restore sentence capitalization. Preserve the user's natural speaking style.",
        concise: "Transform the dictation into a punchy, highly concise summary without filler or fluff.",
        professional: "Polite, elegant executive prose suitable for business correspondence.",
        prompt: "Restructure this voice input into an optimized, structured prompt for an AI assistant with Goal, Context, and Format.",
        code: "Format as clean developer code comments or markdown code syntax."
      };

      const systemPrompt = `You are Talkity's intelligent speech post-processing engine.
${promptToneMap[tone] || promptToneMap.clean}
Target App Context: "${context || 'general text editor'}"
Custom Vocabulary: ${userDictionary.map(d => `${d.phrase} -> ${d.replacement}`).join(', ')}
Output ONLY the final polished text. Do not provide greetings, explanations, or quotes.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawText }
          ],
          temperature: 0.1
        })
      });

      if (response.ok) {
        const data = await response.json();
        const polished = data.choices[0]?.message?.content?.trim();
        return res.json({ formattedText: polished, provider: isGroq ? 'groq-llama3.3' : 'openai-gpt4o' });
      }
    } catch (err) {
      console.warn('LLM API call failed, falling back to rule-based polisher:', err.message);
    }
  }

  const polished = ruleBasedPolish(rawText, tone, userDictionary);
  res.json({ formattedText: polished, provider: 'local-rules-engine' });
});

// GET /history
api.get('/history', (req, res) => {
  const history = readJSON(HISTORY_FILE, inMemoryHistory);
  res.json(history);
});

// POST /history
api.post('/history', (req, res) => {
  const history = readJSON(HISTORY_FILE, inMemoryHistory);
  const newEntry = {
    id: 'item-' + Date.now(),
    timestamp: Date.now(),
    asrText: req.body.asrText || '',
    formattedText: req.body.formattedText || '',
    tone: req.body.tone || 'clean',
    duration: req.body.duration || 0,
    numWords: (req.body.formattedText || '').trim().split(/\s+/).filter(Boolean).length,
    app: req.body.app || 'Web Playground',
    latencyMs: req.body.latencyMs || 250
  };
  history.unshift(newEntry);
  if (history.length > 100) history.pop();
  inMemoryHistory = history;
  writeJSON(HISTORY_FILE, history);
  broadcast({ type: 'history_update', entry: newEntry });
  res.json(newEntry);
});

// DELETE /history
api.delete('/history', (req, res) => {
  inMemoryHistory = [];
  writeJSON(HISTORY_FILE, []);
  broadcast({ type: 'history_cleared' });
  res.json({ success: true, message: 'History cleared' });
});

// GET /dictionary
api.get('/dictionary', (req, res) => {
  const dict = readJSON(DICTIONARY_FILE, inMemoryDictionary);
  res.json(dict);
});

// POST /dictionary
api.post('/dictionary', (req, res) => {
  const { phrase, replacement } = req.body;
  if (!phrase || !replacement) {
    return res.status(400).json({ error: 'Phrase and replacement are required' });
  }
  const dict = readJSON(DICTIONARY_FILE, inMemoryDictionary);
  dict.push({ phrase, replacement });
  inMemoryDictionary = dict;
  writeJSON(DICTIONARY_FILE, dict);
  res.json({ success: true, dictionary: dict });
});

// DELETE /dictionary/:index
api.delete('/dictionary/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const dict = readJSON(DICTIONARY_FILE, inMemoryDictionary);
  if (idx >= 0 && idx < dict.length) {
    dict.splice(idx, 1);
    inMemoryDictionary = dict;
    writeJSON(DICTIONARY_FILE, dict);
  }
  res.json({ success: true, dictionary: dict });
});

// POST /inject
api.post('/inject', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  broadcast({ type: 'inject_text', text });
  res.json({ success: true, message: 'Injection dispatched to desktop daemon' });
});

// Mount router on both /api and root
app.use('/api', api);
app.use(api);

// Fallback: Serve index.html for root or non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Talkity API is running.');
  }
});

// Start listening only in standalone local mode (not in Vercel Serverless)
if (!IS_VERCEL && require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Talkity Web Server running at: http://localhost:${PORT}`);
    console.log(`🎙️ WebSocket ready for live audio & desktop injection`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
