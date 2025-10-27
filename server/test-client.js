// Simple test client for the proxy server
// Usage: node test-client.js
// Reads PROXY_URL and APP_CLIENT_TOKEN from environment or uses defaults

const DEFAULT_PROXY = process.env.PROXY_URL || 'http://127.0.0.1:3123';
const TOKEN = process.env.APP_CLIENT_TOKEN || process.env.APP_CLIENT_TOKEN || 'dev-token-change-me';

async function main() {
  // Build a safe URL for the /api/generate endpoint
  const url = new URL('/api/generate', DEFAULT_PROXY).toString();
  console.log('Testing proxy at:', url);
  console.log('Using token:', TOKEN);

  try {
    // Use global fetch (Node 18+) or fallback to a minimal http request
    if (typeof fetch === 'function') {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`
        },
        body: JSON.stringify({ message: 'Olá do test-client! Como você está?', sessionId: undefined })
      });

      console.log('Status:', resp.status);
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        console.log('Response JSON:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Response text:', text);
      }
    } else {
      // Minimal fallback for very old Node versions
      const https = require('http');
      const data = JSON.stringify({ message: 'Olá do test-client! Como você está?' });
      const opts = new URL(url);
      const req = https.request(opts, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': `Bearer ${TOKEN}` } }, res => {
        console.log('Status:', res.statusCode);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => console.log('Response:', body));
      });
      req.on('error', e => console.error('Request error:', e.message));
      req.write(data);
      req.end();
    }
  } catch (err) {
    console.error('Error calling proxy:', err.message || err);
    console.error('\nHints:');
    console.error('- Ensure the proxy is running (cd server && npm start).');
  console.error('- If you rely on a local web UI, make sure it is running and reachable at WEBUI_URL (e.g. http://127.0.0.1:5000).');
  console.error('- For quick UI testing, set MOCK_GEMINI=true in server/.env and restart the proxy.');
  }
}

main();
