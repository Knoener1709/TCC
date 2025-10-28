// Extraído de boto-only.html: lógica principal do cliente
const botoContainer = document.getElementById('boto-container');
const botoBody = document.getElementById('boto-body');
const errorIcon = document.getElementById('error-icon');
let currentAnimation = 'idle';
botoContainer.classList.add('idle');
function playAnimation(animationName) {
    botoContainer.classList.remove('idle', 'tap', 'wave', 'success', 'error', 'loading');
    void botoContainer.offsetWidth;
    botoContainer.classList.add(animationName);
    currentAnimation = animationName;
    if (animationName === 'error') {
        errorIcon.textContent = Math.random() < 0.5 ? '?' : 'X';
    }
    if (!['idle', 'loading'].includes(animationName)) {
        let duration = 500; // default for tap and error
        if (animationName === 'wave') duration = 700;
        if (animationName === 'success') duration = 1000;
        setTimeout(() => {
            if (currentAnimation === animationName) {
                playAnimation('idle');
            }
        }, duration);
    }
}

// Chat Functions
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const apiUrlInput = document.getElementById('apiUrlInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiStatus = document.getElementById('apiStatus');

// Client token & proxy URL defaults (sem exigir input do usuário)
const DEFAULT_CLIENT_TOKEN = 'dev-token-change-me';
// Força o token fixo, ignorando qualquer valor salvo anteriormente
let clientToken = DEFAULT_CLIENT_TOKEN;
try { localStorage.setItem('boto_client_token', DEFAULT_CLIENT_TOKEN); } catch(_) {}
// Se a página estiver aberta via file://, o hostname fica vazio; use 127.0.0.1
const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
const defaultHost = isHttp && window.location.hostname ? window.location.hostname : '127.0.0.1';
// Força usar porta 3123 como padrão (onde o servidor está configurado)
let proxyBaseUrl = localStorage.getItem('boto_proxy_url') || `http://${defaultHost}:3123`;
let conversationHistory = [];

// Respostas predefinidas: mapeamento de gatilhos (regex) para respostas do Boto
// Alguns gatilhos usam handlers assíncronos para dinamicamente gerar respostas (hora, data, status)
const predefinedResponses = [
    { match: /^(oi|ol[aá]|ol[aá] tudo bem|bom dia|boa tarde|boa noite)\b/i, reply: 'Olá! Eu sou o Boto, seu assistente virtual inteligente! 🐬💗' },
    { match: /qual\s*(é|e)\s*seu\s*nome\??/i, reply: 'Meu nome é Boto — prazer em ajudar! 😊' },
    { match: /(como\s*(vai|esta|está)|tudo\s*bem)/i, reply: 'Estou ótimo! Pronto para ajudar. ✨' },
    { match: /ajuda|help|comandos?/i, reply: 'Posso responder perguntas, executar comandos simples e conectar ao servidor proxy. Tente: "qual seu nome", "oi", "yipieeee", "que horas são?"' },
    { match: /yipie+e*/i, reply: 'Yipieeee! 🎉 Bora conversar!' },
    { match: /^(qual\s*o\s*projeto|o\s*que\s*é)\s*this|o\s*que\s*é\s*este\s*projeto\??/i, reply: 'Este é um projeto de demonstração com um assistente local chamado Boto. Ele pode responder perguntas básicas e encaminhar ao proxy quando necessário.' },
    { match: /conte\s*uma\s*piada|piada/i, handler: async () => {
        const jokes = [
            'Por que o computador foi ao médico? Porque tinha um vírus! 😅',
            'O que o zero disse ao oito? Belo cinto! 🤣',
            'Por que o programador confunde Halloween com Natal? Porque OCT 31 = DEC 25. 🎃🎄'
        ];
        return jokes[Math.floor(Math.random() * jokes.length)];
    }},
    { match: /(que\s*horas\s*(são|sao)?|que\s*hora(s)?\??)/i, handler: async () => {
        const d = new Date();
        return `Agora são ${d.toLocaleTimeString('pt-BR')}`;
    }},
    { match: /que\s*dia\s*(é|é\s*hoje|hoje)\??/i, handler: async () => {
        const d = new Date();
        return `Hoje é ${d.toLocaleDateString()}`;
    }},
    // Personalidade / curiosidades
    { match: /me\s*conte\s*(algo\s*)?(curioso|interessante)|algo\s*curioso/i, handler: async () => {
        const facts = [
            'Sabia que o polvo tem três corações? 🐙',
            'Uma nuvem pode pesar mais de um milhão de toneladas! ☁️',
            'O mel nunca estraga — arqueólogos encontraram mel com milhares de anos ainda comestível. 🍯'
        ];
        return facts[Math.floor(Math.random() * facts.length)];
    }},
    // Conversões simples (km <-> mi, C <-> F)
    { match: /(?:converta|converter|convert|transforma)\s+([0-9]+(?:[.,][0-9]+)?)\s*(km|mi|kmh|mph|c|f|°c|°f)\s*(?:para|to)\s*(km|mi|c|f|°c|°f)/i, handler: async (text) => {
        try {
            const m = text.match(/(?:converta|converter|convert|transforma)\s+([0-9]+(?:[.,][0-9]+)?)\s*(km|mi|kmh|mph|c|f|°c|°f)\s*(?:para|to)\s*(km|mi|c|f|°c|°f)/i);
            if (!m) return null;
            let v = parseFloat(m[1].replace(',', '.'));
            const from = m[2].toLowerCase();
            const to = m[3].toLowerCase();
            // km <-> mi
            if ((from === 'km' || from === 'kmh') && (to === 'mi')) {
                const out = v * 0.621371;
                return `${v} ${from} ≈ ${Number(out.toFixed(4))} mi`;
            }
            if (from === 'mi' && (to === 'km')) {
                const out = v / 0.621371;
                return `${v} mi ≈ ${Number(out.toFixed(4))} km`;
            }
            // C <-> F
            if ((from === 'c' || from === '°c') && (to === 'f' || to === '°f')) {
                const out = (v * 9/5) + 32;
                return `${v}°C ≈ ${Number(out.toFixed(2))}°F`;
            }
            if ((from === 'f' || from === '°f') && (to === 'c' || to === '°c')) {
                const out = (v - 32) * 5/9;
                return `${v}°F ≈ ${Number(out.toFixed(2))}°C`;
            }
            return 'Conversão não suportada.';
        } catch (e) {
            return 'Erro ao tentar converter unidades.';
        }
    }},
    // Lembrete local: 'lembre me em 10 minutos: comprar leite'
    { match: /lembre[- ]?me\s*(?:em)?\s*(\d+)\s*(segundos|s|minutos|min|horas|h)\s*:?\s*(.*)/i, handler: async (text) => {
        const m = text.match(/lembre[- ]?me\s*(?:em)?\s*(\d+)\s*(segundos|s|minutos|min|horas|h)\s*:?\s*(.*)/i);
        if (!m) return null;
        const num = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const msg = m[3] && m[3].trim() ? m[3].trim() : 'lembrete';
        let ms = 0;
        if (unit.startsWith('s')) ms = num * 1000;
        else if (unit.startsWith('min')) ms = num * 60 * 1000;
        else if (unit.startsWith('h')) ms = num * 60 * 60 * 1000;
        else ms = num * 1000;
        setTimeout(() => {
            addMessage(`⏰ Lembrete: ${msg}`, 'boto');
            playAnimation('success');
        }, ms);
        return `Ok — vou te lembrar em ${num} ${unit} sobre: ${msg}`;
    }},
    // Sumário simples: 'resuma: ...'
    { match: /resuma(?:r)?\s*[:\-]?\s*(.+)/i, handler: async (text) => {
        const m = text.match(/resuma(?:r)?\s*[:\-]?\s*(.+)/i);
        if (!m) return null;
        const body = m[1].trim();
        // extractive: return first 2 sentences or first 200 chars
        const sentences = body.match(/[^\.\!\?]+[\.\!\?]*/g) || [];
        if (sentences.length >= 2) return sentences.slice(0,2).join(' ').trim();
        return body.length > 200 ? body.slice(0,197) + '...' : body;
    }},
    // História curta
    { match: /conte\s*(uma\s*)?hist[oó]ria\s*(curta)?/i, handler: async () => {
        const protagonists = ['uma menina', 'um garoto', 'um gato curioso', 'um robô chamado Boto'];
        const places = ['na praia', 'na cidade', 'num laboratório secreto', 'num parque encantado'];
        const acts = ['encontrou um mapa misterioso', 'descobriu uma porta escondida', 'ganhou um amigo improvável', 'aprendeu algo importante'];
        const p = protagonists[Math.floor(Math.random() * protagonists.length)];
        const pl = places[Math.floor(Math.random() * places.length)];
        const a = acts[Math.floor(Math.random() * acts.length)];
        return `${p} ${pl} e ${a}. Fim.`;
    }},
    { match: /^reset$|^limpar\s*conversa$|^limpar$/i, handler: async () => {
        // limpa o histórico localmente
        conversationHistory = [];
        try { localStorage.removeItem('boto_session_id'); } catch(_) {}
        return 'Conversa reiniciada localmente.';
    }},
    { match: /status\s*do\s*servidor|server\s*status|status server/i, handler: async () => {
        // tenta consultar o endpoint /health no proxyBaseUrl
        try {
            const r = await fetchWithTimeout(`${proxyBaseUrl.replace(/\/+$/, '')}/health`, {}, 3000);
            if (r && r.ok) return 'Servidor proxy: online';
            return 'Servidor proxy: offline ou sem resposta';
        } catch (_) {
            return 'Servidor proxy: offline ou sem resposta';
        }
    } }
];

async function checkPredefinedResponsesAsync(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.trim();
    for (const item of predefinedResponses) {
        try {
            if (item.match.test(t)) {
                if (item.handler) return await item.handler(t);
                return item.reply || null;
            }
        } catch (e) {
            console.error('Erro no handler de predefined response', e);
        }
    }
    return null;
}

// Load saved client token on startup
apiUrlInput.value = proxyBaseUrl;
apiKeyInput.value = clientToken;
updateApiStatus('connected', 'Inicializando conexão com o proxy...');

// Tenta detectar automaticamente o proxy local (prioriza porta 3123, depois 3000 e 3100)
(async () => {
    console.log('[Boto Debug] Iniciando detecção de proxy...');
    console.log('[Boto Debug] defaultHost:', defaultHost);
    try {
        const detected = await (async function detectProxyBaseUrl() {
            const bases = [
                `http://${defaultHost}:3123`,
                `http://${defaultHost}:3000`,
                `http://${defaultHost}:3100`
            ];
            console.log('[Boto Debug] Tentando portas:', bases);
            for (const base of bases) {
                try {
                    console.log('[Boto Debug] Testando:', base + '/health');
                    const r = await fetchWithTimeout(`${base.replace(/\/+$/, '')}/health`, {}, 2500);
                    console.log('[Boto Debug] Resposta de', base, ':', r.status, r.ok);
                    if (r.ok) {
                        console.log('[Boto Debug] ✓ Proxy encontrado em:', base);
                        return base;
                    }
                } catch (e) {
                    console.log('[Boto Debug] ✗ Falha em', base, ':', e.message);
                }
            }
            console.log('[Boto Debug] Nenhum proxy encontrado, usando padrão:', bases[0]);
            return bases[0];
        })();
        proxyBaseUrl = detected;
        localStorage.setItem('boto_proxy_url', proxyBaseUrl);
        apiUrlInput.value = proxyBaseUrl;
        updateApiStatus('connected', `Conectado ao proxy em ${proxyBaseUrl}.`);
    } catch (e) {
        console.error('[Boto Debug] Erro na detecção:', e);
        updateApiStatus('error', 'Não foi possível detectar o proxy automaticamente.');
    }
})();

function saveApiSettings() {
    const url = apiUrlInput.value.trim();
    const token = apiKeyInput.value.trim();
    if (!/^https?:\/\//i.test(url)) {
        updateApiStatus('error', 'URL do proxy inválida!');
        playAnimation('error');
        return;
    }
    if (!token) {
        updateApiStatus('error', 'Token inválido!');
        playAnimation('error');
        return;
    }

    proxyBaseUrl = url;
    clientToken = token;
    localStorage.setItem('boto_proxy_url', proxyBaseUrl);
    localStorage.setItem('boto_client_token', clientToken);
    updateApiStatus('connected', 'Configurações salvas.');
    playAnimation('success');
    // Clear and reset conversation
    conversationHistory = [];
}

function updateApiStatus(status, message) {
    apiStatus.className = `api-status ${status}`;
    const icon = status === 'connected' ? 'check_circle' : 
                status === 'error' ? 'error' : 'info';
    apiStatus.innerHTML = `<span class="material-icons" style="font-size: 14px;">${icon}</span>${message}`;
}

function toggleChat() {
    chatContainer.classList.toggle('active');
    if (chatContainer.classList.contains('active')) {
        chatInput.focus();
        playAnimation('wave');
    } else {
        playAnimation('idle');
    }
}

function addMessage(text, sender, isHtml = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    if (isHtml) {
        messageDiv.innerHTML = text;
    } else {
        messageDiv.textContent = text;
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator active';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv && typingDiv.parentNode) {
        typingDiv.parentNode.removeChild(typingDiv);
    }
}

// Small helper to add a timeout to fetch (prevents endless loading)
async function fetchWithTimeout(resource, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(id);
    }
}

// Use a persisted sessionId so the server can maintain context across turns
let sessionId = localStorage.getItem('boto_session_id') || '';

// Call our project proxy (requires clientToken)
async function callProxy(userMessage) {
    // If no client token, instruct user to set it
    if (!clientToken) {
        return 'Por favor, configure o token do cliente para usar o assistente do projeto.';
    }

    // POST to configured proxy base URL
    const url = `${proxyBaseUrl.replace(/\/+$/, '')}/api/generate`;
    
    console.log('[Boto Debug] Chamando proxy:', url);
    console.log('[Boto Debug] Token:', clientToken.substring(0, 10) + '...');
    console.log('[Boto Debug] SessionId:', sessionId || '(novo)');

    try {
        const resp = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            // Send user's message and current sessionId so the server can maintain context
            body: JSON.stringify({ message: userMessage, sessionId })
        }, 20000);

        console.log('[Boto Debug] Status resposta:', resp.status);

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            console.error('Proxy Error:', resp.status, err);
            if (resp.status === 401) {
                return 'Acesso negado ao proxy. Token inválido ou ausente. 🔒';
            }
            if (resp.status === 429) {
                return 'Limite do servidor atingido. Tente novamente mais tarde. ⏰';
            }
            return 'Erro no servidor. Tente novamente mais tarde. 😅';
        }

        const data = await resp.json();
        console.log('[Boto Debug] Resposta OK, sessionId:', data.sessionId);
                const assistantMessage = data.reply || null;
        if (data.sessionId) {
            sessionId = data.sessionId;
            try { localStorage.setItem('boto_session_id', sessionId); } catch(_) {}
        }

        conversationHistory.push({ role: 'assistant', content: assistantMessage });
        if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);
                return assistantMessage;

    } catch (error) {
        console.error('[Boto Debug] Erro completo:', error);
        if (error.name === 'AbortError') {
            return 'Tempo limite excedido ao chamar o servidor. Tente novamente. ⏳';
        }
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            return `Não consegui conectar ao servidor em ${proxyBaseUrl}. Verifique se o servidor está rodando na porta 3123. 🔌`;
        }
        return `Erro ao chamar o proxy: ${error.message}. Verifique se o servidor está rodando.`;
    }
}


async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '') return;
    
    if (!clientToken) {
        addMessage('Por favor, configure o token do cliente nas Configurações de API para usar o assistente do projeto.', 'boto');
        playAnimation('error');
        return;
    }
    
    // Add user message
    addMessage(message, 'user');
    chatInput.value = '';
    
    // Disable input while processing
    chatInput.disabled = true;
    sendButton.disabled = true;
    playAnimation('loading');
    
    // Show typing indicator
    showTypingIndicator();

    // Check for predefined responses first (async handlers supported)
    let response = await checkPredefinedResponsesAsync(message);
    if (response) {
        // Simula um pequeno delay como se fosse o servidor
        await new Promise(r => setTimeout(r, 300));
        removeTypingIndicator();
        addMessage(response, 'boto');
        // Re-enable input
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.focus();
        playAnimation('success');
        return;
    }

    // Call project proxy (no predefined match)
    try {
        response = await callProxy(message);
    } catch (e) {
        console.error('Unexpected error:', e);
        response = null;
    }

    // Remove typing indicator
    removeTypingIndicator();

    // Mapear erros de conexão/timeout do proxy para uma mensagem amigável
    const connectionErrorPatterns = [
        /não\s*consegui\s*conectar/i,
        /erro\s*ao\s*chamar\s*o\s*proxy/i,
        /tempo\s*limite/i,
        /verifique\s*se\s*o\s*servidor\s*est[aá]\s*rodando/i,
        /failed to fetch/i
    ];

    if (typeof response === 'string') {
        const respTrim = response.trim();
        const isConnError = connectionErrorPatterns.some(p => p.test(respTrim));
        if (isConnError) {
            response = 'não tenho uma resposta para isso';
        } else if (respTrim === '') {
            response = 'sem resposta para isso';
        }
    } else {
        // não string (null/undefined) -> sem resposta
        response = 'sem resposta para isso';
    }

    // Add AI response
    addMessage(response, 'boto');
    
    // Re-enable input
    chatInput.disabled = false;
    sendButton.disabled = false;
    chatInput.focus();
    playAnimation('success');
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Optional: small reset helper to clear the session in the browser (server will recreate on next turn)
async function resetConversation() {
    const old = sessionId;
    sessionId = '';
    try { localStorage.removeItem('boto_session_id'); } catch(_) {}
    conversationHistory = [];
    // Best-effort notify server to drop old session (safe to ignore errors)
    try {
        const url = `${proxyBaseUrl.replace(/\/+$/, '')}/api/reset`;
        await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify({ sessionId: old })
        }, 5000);
    } catch(_) {}
}

// Expor funções utilizadas inline no HTML para o escopo global
// (quando carregado como <script type="module"> as declarações ficam no escopo do módulo)
if (typeof window !== 'undefined') {
    window.playAnimation = playAnimation;
    window.toggleChat = toggleChat;
    window.saveApiSettings = saveApiSettings;
    window.sendMessage = sendMessage;
    window.handleKeyPress = handleKeyPress;
    window.resetConversation = resetConversation;
}
