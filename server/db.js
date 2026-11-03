import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataDir = isServerless ? '/tmp' : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'finchat.sqlite');
export const db = new DatabaseSync(dbPath);

// Habilita chaves estrangeiras e modo WAL para melhor performance
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'wallet', 'credit_card')),
    initial_balance REAL NOT NULL DEFAULT 0,
    credit_limit REAL DEFAULT 0,
    closing_day INTEGER,
    due_day INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    monthly_budget REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#10b981',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- formato ISO YYYY-MM-DD (exibido como dd/mm/aaaa no frontend)
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Débito',
    account_name TEXT NOT NULL DEFAULT 'Conta Principal',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    installment_info TEXT DEFAULT '', -- ex.: '1/10' ou ''
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'overdue')),
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    pending_action_json TEXT,
    action_status TEXT NOT NULL DEFAULT 'none' CHECK (action_status IN ('none', 'pending', 'confirmed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export const DEFAULT_CATEGORIES = [
  { name: 'Moradia', budget: 1800, color: '#6366f1' },
  { name: 'Alimentação', budget: 1200, color: '#f59e0b' },
  { name: 'Transporte', budget: 500, color: '#3b82f6' },
  { name: 'Saúde', budget: 400, color: '#ef4444' },
  { name: 'Educação', budget: 350, color: '#8b5cf6' },
  { name: 'Lazer', budget: 450, color: '#ec4899' },
  { name: 'Assinaturas', budget: 150, color: '#14b8a6' },
  { name: 'Dívidas', budget: 300, color: '#f97316' },
  { name: 'Investimentos', budget: 800, color: '#10b981' },
  { name: 'Outros', budget: 300, color: '#64748b' },
];

export const WELCOME_MESSAGE = `Olá! 👋 Eu sou seu assistente financeiro pessoal. Você não precisa preencher formulários: basta conversar comigo e eu organizo sua planilha automaticamente!

Experimente digitar ou clicar em uma das frases abaixo:
• *"Gastei 45 reais no mercado hoje no débito"*
• *"Recebi 3.200 de salário ontem"*
• *"Comprei um fone de 300 reais em 3x no cartão em Lazer"*`;

export function seedUserDefaults(userId, selectedCategories = null, initialBalance = 1500, mainAccountName = 'Conta Corrente') {
  const catsToInsert = selectedCategories && selectedCategories.length > 0
    ? DEFAULT_CATEGORIES.filter((c) => selectedCategories.includes(c.name))
    : DEFAULT_CATEGORIES;

  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, name, monthly_budget, color) VALUES (?, ?, ?, ?)'
  );
  for (const cat of catsToInsert) {
    insertCat.run(userId, cat.name, cat.budget, cat.color);
  }

  const existingAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE user_id = ?').get(userId);
  if (existingAccounts.count === 0) {
    const insertAcc = db.prepare(
      'INSERT INTO accounts (user_id, name, type, initial_balance, credit_limit, closing_day, due_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertAcc.run(userId, mainAccountName, 'checking', Number(initialBalance) || 0, 0, null, null);
    insertAcc.run(userId, 'Cartão Principal', 'credit_card', 0, 4500, 3, 10);
    insertAcc.run(userId, 'Carteira Física', 'wallet', 0, 0, null, null);
  }

  const existingMsgs = db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE user_id = ?').get(userId);
  if (existingMsgs.count === 0) {
    db.prepare(
      'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
    ).run(userId, 'assistant', WELCOME_MESSAGE, 'none');
  }
}

// Garante conta de demonstração pronta para uso imediato
function ensureDemoUser() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@finchat.com.br');
  if (existing) return;

  const hash = bcrypt.hashSync('123456', 10);
  const res = db.prepare(
    'INSERT INTO users (name, email, password_hash, onboarded) VALUES (?, ?, ?, 1)'
  ).run('Usuário Demo', 'demo@finchat.com.br', hash);
  const userId = Number(res.lastInsertRowid);

  seedUserDefaults(userId, null, 2400, 'Conta Itaú');

  // Datas do mês atual e anterior no fuso de São Paulo
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prevDate = new Date(yyyy, now.getMonth() - 1, 15);
  const prevY = prevDate.getFullYear();
  const prevM = String(prevDate.getMonth() + 1).padStart(2, '0');

  const insertTx = db.prepare(`
    INSERT INTO transactions (
      user_id, date, description, category, type, amount, payment_method, account_name, is_recurring, installment_info, notes, status, due_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Lançamentos do mês anterior (para comparação mensal)
  insertTx.run(userId, `${prevY}-${prevM}-05`, 'Salário Mensal', 'Outros', 'income', 5800, 'PIX', 'Conta Itaú', 1, '', 'Salário líquido', 'paid', null);
  insertTx.run(userId, `${prevY}-${prevM}-10`, 'Aluguel + Condomínio', 'Moradia', 'expense', 1750, 'PIX', 'Conta Itaú', 1, '', '', 'paid', null);
  insertTx.run(userId, `${prevY}-${prevM}-14`, 'Supermercado Extra', 'Alimentação', 'expense', 640.50, 'Débito', 'Conta Itaú', 0, '', 'Compra do mês', 'paid', null);
  insertTx.run(userId, `${prevY}-${prevM}-20`, 'Combustível e Uber', 'Transporte', 'expense', 310.00, 'Crédito', 'Cartão Nubank', 0, '', '', 'paid', null);

  // Lançamentos do mês atual
  insertTx.run(userId, `${yyyy}-${mm}-01`, 'Salário Mensal', 'Outros', 'income', 5800, 'PIX', 'Conta Itaú', 1, '', 'Salário líquido', 'paid', null);
  insertTx.run(userId, `${yyyy}-${mm}-02`, 'Aluguel + Condomínio', 'Moradia', 'expense', 1750, 'PIX', 'Conta Itaú', 1, '', 'Pago em dia', 'paid', null);
  insertTx.run(userId, `${yyyy}-${mm}-02`, 'Supermercado Pão de Açúcar', 'Alimentação', 'expense', 485.90, 'Débito', 'Conta Itaú', 0, '', 'Feira e limpeza', 'paid', null);
  insertTx.run(userId, `${yyyy}-${mm}-03`, 'Assinatura Netflix + Spotify', 'Assinaturas', 'expense', 76.80, 'Crédito', 'Cartão Nubank', 1, '', 'Recorrente mensal', 'paid', null);
  insertTx.run(userId, `${yyyy}-${mm}-03`, 'Tênis Corrida', 'Saúde', 'expense', 199.90, 'Crédito', 'Cartão Nubank', 0, '2/4', 'Parcela 2 de 4', 'paid', null);

  // Conta a vencer nos próximos 5 dias para demonstrar alerta de vencimento
  const dueSoon = new Date(now.getTime() + 4 * 86400000);
  const dueStr = dueSoon.toISOString().slice(0, 10);
  insertTx.run(userId, dueStr, 'Conta de Energia (Enel)', 'Moradia', 'expense', 215.40, 'Boleto', 'Conta Itaú', 1, '', 'Vence esta semana', 'pending', dueStr);

  // Meta de economia padrão
  db.prepare(
    'INSERT INTO goals (user_id, title, target_amount, current_amount, deadline) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, 'Reserva de Emergência até Dezembro', 5000, 2150, `${yyyy}-12-31`);
}

ensureDemoUser();

