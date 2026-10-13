const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const DICTIONARY_FILE = path.join(DATA_DIR, 'dictionary.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Initialize settings
function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {}
  return {
    groqApiKey: process.env.GROQ_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    language: 'en-IN',
    autoCopy: true,
    soundChimes: true
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {}
}

// Initialize default files if missing
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
}

if (!fs.existsSync(DICTIONARY_FILE)) {
  fs.writeFileSync(DICTIONARY_FILE, JSON.stringify([
    { phrase: "talkity", replacement: "Talkity" },
    { phrase: "antigravity", replacement: "Antigravity" },
    { phrase: "pi yush", replacement: "Piyush" },
    { phrase: "ui automation", replacement: "UI Automation" }
  ], null, 2));
}

app.use(cors());

// Raw body parser for audio uploads
app.use('/api/transcribe', express.raw({ type: '*/*', limit: '50mb' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Store active desktop / client ws connections
const clients = new Set();
let desktopClient = null;

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

function broadcast(event) {
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(event));
    }
  }
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
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

// GET /api/settings
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  const current = getSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);
  res.json({ success: true, settings: updated });
});

// POST /api/transcribe (Handles raw audio uploads from Desktop App or Web App)
app.post('/api/transcribe', async (req, res) => {
  const settings = getSettings();
  const groqKey = req.headers['x-groq-key'] || settings.groqApiKey || process.env.GROQ_API_KEY;
  const openaiKey = req.headers['x-openai-key'] || settings.openaiApiKey || process.env.OPENAI_API_KEY;
  const lang = req.headers['x-language'] || settings.language || 'en';

  const audioBuffer = req.body;
  if (!audioBuffer || audioBuffer.length < 500) {
    return res.status(400).json({ error: 'No audio data received or recording was too short.' });
  }

  console.log(`🎙️ Received audio for transcription: ${audioBuffer.length} bytes`);

  // 1. Groq Whisper (Ultra-low latency ~150ms, near 100% accuracy)
  if (groqKey) {
    try {
      console.log('⚡ Calling Groq Whisper-large-v3...');
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
        console.log(`[🗣️ Groq ASR]: "${rawText}"`);

        const dict = readJSON(DICTIONARY_FILE, []);
        const formatted = ruleBasedPolish(rawText, 'clean', dict);

        return res.json({
          text: rawText,
          formattedText: formatted,
          provider: 'groq-whisper-large-v3'
        });
      } else {
        const err = await response.text();
        console.error('Groq Whisper error:', err);
      }
    } catch (err) {
      console.error('Groq transcription error:', err.message);
    }
  }

  // 2. OpenAI Whisper
  if (openaiKey) {
    try {
      console.log('Calling OpenAI Whisper...');
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
        const dict = readJSON(DICTIONARY_FILE, []);
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

  // If no API key is configured
  return res.status(400).json({
    error: 'No Whisper API key configured. Please add your free Groq API key in Settings (get free key at console.groq.com) or use browser Web Speech.',
    hint: 'Groq provides 14,400 free Whisper requests/day with zero setup.'
  });
});

// POST /api/polish
app.post('/api/polish', async (req, res) => {
  const { rawText, context = '', tone = 'clean', dictionary = [] } = req.body;
  const settings = getSettings();
  const apiKey = req.headers['x-groq-key'] || settings.groqApiKey || process.env.GROQ_API_KEY || req.headers['x-openai-key'] || settings.openaiApiKey || process.env.OPENAI_API_KEY;

  const userDictionary = dictionary.length ? dictionary : readJSON(DICTIONARY_FILE, []);

  if (!rawText) {
    return res.status(400).json({ error: 'rawText is required' });
  }

  // If API key is available, call Groq/OpenAI for LLM polishing
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

  // Offline / Fallback rule-based engine
  const polished = ruleBasedPolish(rawText, tone, userDictionary);
  res.json({ formattedText: polished, provider: 'local-rules-engine' });
});

// GET /api/history
app.get('/api/history', (req, res) => {
  const history = readJSON(HISTORY_FILE, []);
  res.json(history);
});

// POST /api/history
app.post('/api/history', (req, res) => {
  const history = readJSON(HISTORY_FILE, []);
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
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  broadcast({ type: 'history_update', entry: newEntry });
  res.json(newEntry);
});

// DELETE /api/history
app.delete('/api/history', (req, res) => {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
  broadcast({ type: 'history_cleared' });
  res.json({ success: true });
});

// GET /api/dictionary
app.get('/api/dictionary', (req, res) => {
  const dict = readJSON(DICTIONARY_FILE, []);
  res.json(dict);
});

// POST /api/dictionary
app.post('/api/dictionary', (req, res) => {
  const { phrase, replacement } = req.body;
  if (!phrase || !replacement) {
    return res.status(400).json({ error: 'Phrase and replacement are required' });
  }
  const dict = readJSON(DICTIONARY_FILE, []);
  dict.push({ phrase, replacement });
  fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(dict, null, 2));
  res.json({ success: true, dictionary: dict });
});

// DELETE /api/dictionary/:index
app.delete('/api/dictionary/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const dict = readJSON(DICTIONARY_FILE, []);
  if (idx >= 0 && idx < dict.length) {
    dict.splice(idx, 1);
    fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(dict, null, 2));
  }
  res.json({ success: true, dictionary: dict });
});

// POST /api/inject
app.post('/api/inject', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  broadcast({ type: 'inject_text', text });
  res.json({ success: true, message: 'Injection dispatched to desktop daemon' });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Talkity Web Server running at: http://localhost:${PORT}`);
  console.log(`🎙️ WebSocket ready for live audio & desktop injection`);
  console.log(`======================================================\n`);
});
