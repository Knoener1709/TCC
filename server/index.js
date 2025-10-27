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
const WEBUI_URL = process.env.WEBUI_URL || '';
const WEBUI_MODEL = process.env.WEBUI_MODEL || '';
const SIMPLE_BOT = (process.env.SIMPLE_BOT || 'false').toLowerCase() === 'true';
const APP_CLIENT_TOKEN = process.env.APP_CLIENT_TOKEN || 'dev-token-change-me';
const MOCK_GEMINI = (process.env.MOCK_GEMINI || 'false').toLowerCase() === 'true';

// Determine configured provider: mock, webui, openai, or none
const PROVIDER = MOCK_GEMINI ? 'mock' : (WEBUI_URL ? 'webui' : (OPENAI_API_KEY ? 'openai' : 'none'));

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

// Very small rule-based bot for specific simple commands (fast, deterministic)
function simpleBotRespond(message) {
  if (!message || typeof message !== 'string') return null;
  const m = message.trim().toLowerCase();
  // greetings
  if (/^\s*(oi|olá|ola|hello|eai)\b/.test(m)) return 'Oi! Eu sou o Boto 🐬 — posso responder coisas simples como hora, data, piada ou ajudar com comandos. Diga "ajuda" para ver opções.';
  if (/\b(ajuda|help|comandos)\b/.test(m)) return 'Comandos disponíveis: "hora" (mostra hora atual), "data" (mostra data), "piada" (uma piada curta), "olá" (cumprimento). Por exemplo: "Que horas são?"';
  if (/\b(hora|que horas|que horas são|horas)\b/.test(m)) {
    const now = new Date();
    return `Agora são ${now.toLocaleTimeString('pt-BR')}.`; 
  }
  if (/\b(data|que dia|qual a data|dia de hoje)\b/.test(m)) {
    const now = new Date();
    return `Hoje é ${now.toLocaleDateString('pt-BR')}.`;
  }
  if (/\b(piada|conte uma piada|piadas)\b/.test(m)) return 'Por que o programador sempre confunde Halloween com o Natal? Porque OCT 31 = DEC 25. 🎃🎄';
  if (/\b(tchau|até|adeus)\b/.test(m)) return 'Tchau! Se precisar, chame-me novamente. 🐬';
  // fallback short help
  return null;
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

    // SIMPLE_BOT mode: handle simple deterministic commands locally (fast)
    if (SIMPLE_BOT) {
      const simpleReply = simpleBotRespond(message);
      if (simpleReply) {
        // Save into session
        session.messages.push({ role: 'user', content: message });
        session.messages.push({ role: 'assistant', content: simpleReply });
        if (session.messages.length > 1 + 20) {
          const [system, ...rest] = session.messages;
          session.messages = [system, ...rest.slice(-20)];
        }
        sessions.set(session.id, session.messages);
        return res.json({ reply: simpleReply, sessionId: session.id });
      }
      // fallthrough to WEBUI or other providers if simple bot didn't match
    }

    // Local web UI support: prefer WEBUI when configured
    if (WEBUI_URL) {
      try {
        // Append new user message to session history
        session.messages.push({ role: 'user', content: message });
        let assistantMessage = '';
        const webui = WEBUI_URL.replace(/\/$/, '');
        const messages = session.messages.map(m => ({ role: m.role, content: m.content }));
        const body = {
          model: WEBUI_MODEL || OPENAI_MODEL,
          messages: messages,
          max_tokens: 512,
          temperature: 0.7
        };
        // text-generation-webui exposes an OpenAI-compatible endpoint at /v1/chat/completions
        const resp = await axios.post(webui + '/v1/chat/completions', body, { timeout: 120000 });
        const data = resp.data;
        if (data?.choices && Array.isArray(data.choices) && data.choices[0]?.message?.content) {
          assistantMessage = data.choices[0].message.content;
        } else if (data?.choices && Array.isArray(data.choices) && data.choices[0]?.text) {
          assistantMessage = data.choices[0].text;
        } else {
          assistantMessage = JSON.stringify(data).slice(0, 2000);
        }

        if (!assistantMessage) {
          return res.status(502).json({ error: 'Empty parsed response from provider' });
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
        console.error('Provider proxy error:', err?.response?.data || err.message || err);
        const status = err?.response?.status || 500;
        const msg = err?.response?.data || { error: 'Upstream provider error' };
        return res.status(status).json({ error: msg });
      }
    }

    // If we reach here and OpenAI isn't configured and mock isn't enabled, return a helpful error.
  return res.status(500).json({ error: 'Server misconfigured: no LLM provider configured. Set OPENAI_API_KEY, WEBUI_URL or enable MOCK_GEMINI for testing.' });

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
  console.log(`provider=${PROVIDER} | MOCK_GEMINI=${MOCK_GEMINI} | WEBUI_URL=${WEBUI_URL ? '[SET]' : '[NOT SET]'} | WEBUI_MODEL=${WEBUI_MODEL || '[NOT SET]'} | OPENAI_API_KEY=${OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
  if (PROVIDER === 'none') {
    console.warn('Warning: no LLM provider configured. Set OPENAI_API_KEY, WEBUI_URL or enable MOCK_GEMINI for testing.');
  }
});
