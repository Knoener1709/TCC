# TCC LLM Proxy (OpenAI)

Lightweight Express proxy to forward requests to an LLM provider (OpenAI by default) while keeping the provider API key on the server.

Usage (Windows cmd.exe):

1. Install dependencies

```
cd server
npm install
```

2. Create a `.env` file in `server` with at least:

```
OPENAI_API_KEY=sk-...your_openai_key_here
APP_CLIENT_TOKEN=some-secret-token-for-clients
PORT=3000
```

3. Start the server

```
npm start
```

4. Configure the client to call the proxy endpoint (`http://localhost:3000/api/generate`) and include the authorization header:

```
Authorization: Bearer <APP_CLIENT_TOKEN>
```

5. OpenAI usage and conversations

The proxy prefers OpenAI when `OPENAI_API_KEY` is present. For quick local testing you can enable mock mode by setting `MOCK_GEMINI=true` in `.env`.

The endpoint `/api/generate` now supports multi-turn conversations with a `sessionId`:

- Request: `{ message: string, sessionId?: string }`
- Response: `{ reply: string, sessionId: string }`

If `sessionId` is omitted, the server will create one and return it. Send it back on subsequent turns to preserve context. A helper endpoint `/api/reset` is available to clear a session by id.

Notes & cautions:
- This proxy uses a simple static token for demo purposes. For production, implement proper auth (OAuth/JWT) and persistent rate limiting (Redis).
- Monitor usage and rotate API keys if leaked.
