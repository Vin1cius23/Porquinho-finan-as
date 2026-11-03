# FinChat IA — Controle Financeiro Pessoal por Conversa

Aplicativo web full-stack de controle financeiro pessoal em português do Brasil, onde o usuário conversa em linguagem natural com uma IA (estilo WhatsApp) e o sistema registra, categoriza e organiza tudo automaticamente em uma planilha interativa em tempo real.

## Como rodar localmente

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Configure as variáveis de ambiente:**
   Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
   Edite `.env` e adicione sua chave `ANTHROPIC_API_KEY` da Anthropic (Claude).
   *(Observação: Caso você ainda não tenha uma chave configurada, o sistema conta com um interpretador NLP local em português que segue o mesmo schema JSON validado por Zod para que você possa testar todas as funcionalidades imediatamente).*

3. **Inicie o servidor de desenvolvimento (Backend Express + Frontend Vite na mesma porta):**
   ```bash
   npm run dev
   ```
   Acesse **`http://localhost:3000`** no navegador.
   - Conta de demonstração pronta: `demo@finchat.com.br` / senha `123456` (ou crie uma nova conta para testar o Onboarding em 3 passos).

4. **Build para produção:**
   ```bash
   npm run build
   npm start
   ```

