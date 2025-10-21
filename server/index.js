require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '128kb' }));

// Config from env
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const APP_CLIENT_TOKEN = process.env.APP_CLIENT_TOKEN || 'dev-token-change-me';
const MOCK_GEMINI = (process.env.MOCK_GEMINI || 'false').toLowerCase() === 'true';

// Determine configured provider (mock or openai, or none)
// NOTE: Gemini branch intentionally removed to avoid requiring/using Gemini keys anywhere.
const PROVIDER = MOCK_GEMINI ? 'mock' : (OPENAI_API_KEY ? 'openai' : 'none');

// In-memory conversation sessions
// Map<sessionId, Array<{role: 'system'|'user'|'assistant', content: string}>>
const sessions = new Map();

function generateSessionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback UUID v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getOrCreateSession(sessionId) {
  let sid = sessionId || generateSessionId();
  if (!sessions.has(sid)) {
    sessions.set(sid, [
      {
        role: 'system',
        content: 'Você é o Boto, um assistente virtual amigável, carismático e útil, em forma de boto cor-de-rosa. Fale sempre em português do Brasil, seja claro e acolhedor, utilize emojis de forma moderada (🐬💗✨) para dar leveza, e tente manter respostas concisas mas completas. Se necessário, faça perguntas de esclarecimento. Evite respostas muito longas. '
      }
    ]);
  }
  return { id: sid, messages: sessions.get(sid) };
}

// Basic rate limiter per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Middleware: simple token auth for clients
function requireClientToken(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = auth.split(' ')[1];
  if (!token || token !== APP_CLIENT_TOKEN) {
    return res.status(401).json({ error: 'Invalid client token' });
  }
  next();
}

// POST /api/generate
// Body: { message: string, sessionId?: string }
app.post('/api/generate', requireClientToken, async (req, res) => {
  const { message, sessionId } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing "message" in body' });
  }
  // Get session (create if missing)
  const session = getOrCreateSession(sessionId);


  try {
    // Mock mode: if MOCK_GEMINI=true, return a canned reply
    if (MOCK_GEMINI) {
      const assistantMessage = `Olá! (modo de teste) Você disse: "${message}". Estou aqui para ajudar com o que precisar. 🐬`;
      // Save into session
      session.messages.push({ role: 'user', content: message });
      session.messages.push({ role: 'assistant', content: assistantMessage });
      // Trim history to last N pairs + system
      if (session.messages.length > 1 + 20) {
        const [system, ...rest] = session.messages;
        session.messages = [system, ...rest.slice(-20)];
        sessions.set(session.id, session.messages);
      }
      return res.json({ reply: assistantMessage, sessionId: session.id });
    }

    // Prefer OpenAI if key is configured
    if (OPENAI_API_KEY) {
      try {
        // Append new user message to session history
        session.messages.push({ role: 'user', content: message });

        const resp = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: OPENAI_MODEL,
            messages: session.messages,
            temperature: 0.7,
            max_tokens: 500
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            timeout: 30000
          }
        );

        const data = resp.data || {};
        let assistantMessage = '';
        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          assistantMessage = choice.message?.content || choice.text || '';
        }

        if (!assistantMessage) {
          return res.status(502).json({ error: 'Empty response from OpenAI' });
        }

        // Save assistant reply in session
        session.messages.push({ role: 'assistant', content: assistantMessage });
        // Trim history to keep memory bounded (keep system + last 20 messages)
        if (session.messages.length > 1 + 20) {
          const [system, ...rest] = session.messages;
          session.messages = [system, ...rest.slice(-20)];
        }
        sessions.set(session.id, session.messages);

        return res.json({ reply: assistantMessage, sessionId: session.id });
      } catch (err) {
        console.error('OpenAI proxy error:', err?.response?.data || err.message || err);
        const status = err?.response?.status || 500;
        const msg = err?.response?.data || { error: 'Upstream OpenAI error' };
        return res.status(status).json({ error: msg });
      }
    }

    // If we reach here and OpenAI isn't configured and mock isn't enabled, return a helpful error.
    return res.status(500).json({ error: 'Server misconfigured: no LLM provider configured. Set OPENAI_API_KEY or enable MOCK_GEMINI for testing.' });

  } catch (err) {
    console.error('Proxy error:', err?.response?.data || err.message || err);
    const status = err?.response?.status || 500;
    const msg = err?.response?.data || { error: 'Upstream error' };
    return res.status(status).json({ error: msg });
  }
});

// Optional: reset a session (Body: { sessionId })
app.post('/api/reset', requireClientToken, (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  sessions.delete(sessionId);
  return res.json({ ok: true });
});

const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`Proxy listening on ${HOST}:${PORT} (pid=${process.pid})`);
  console.log(`provider=${PROVIDER} | MOCK_GEMINI=${MOCK_GEMINI} | OPENAI_API_KEY=${OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
  if (PROVIDER === 'none') {
    console.warn('Warning: no LLM provider configured. Set OPENAI_API_KEY or enable MOCK_GEMINI for testing.');
  }
});
