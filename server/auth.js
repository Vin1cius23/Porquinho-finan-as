import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, seedUserDefaults } from './db.js';
import {
  ensureHydratedFromSupabase,
  syncUserToSupabase,
  triggerBackgroundSupabaseSync,
} from './supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'finchat-dev-secret-key-2026';

export function signToken(user, extra = {}) {
  let initialBalance = extra.initialBalance;
  let accountName = extra.accountName;

  if (initialBalance === undefined && user?.id) {
    const mainAcc = db
      .prepare("SELECT name, initial_balance FROM accounts WHERE user_id = ? AND type != 'credit_card' ORDER BY id ASC LIMIT 1")
      .get(user.id);
    if (mainAcc) {
      initialBalance = Number(mainAcc.initial_balance || 0);
      accountName = mainAcc.name;
    }
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      onboarded: user.onboarded ?? 1,
      initialBalance: Number(initialBalance || 0),
      accountName: accountName || 'Conta Corrente Principal',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado. Faça login para continuar.' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Busca prioritariamente pelo e-mail único (garante consistência entre instâncias serverless)
    let user = decoded.email
      ? db.prepare('SELECT id, name, email, onboarded FROM users WHERE email = ?').get(decoded.email)
      : db.prepare('SELECT id, name, email, onboarded FROM users WHERE id = ?').get(decoded.id);

    if (!user && decoded.email) {
      await ensureHydratedFromSupabase(decoded.email);
      user = db.prepare('SELECT id, name, email, onboarded FROM users WHERE email = ?').get(decoded.email);
    }

    // Se ainda não existir na instância Serverless atual, reconstrói a partir do JWT assinado
    if (!user && decoded.email) {
      const ins = db
        .prepare('INSERT INTO users (name, email, password_hash, onboarded) VALUES (?, ?, ?, ?)')
        .run(decoded.name || 'Usuário', decoded.email, '', decoded.onboarded ?? 1);
      const newId = Number(ins.lastInsertRowid);
      seedUserDefaults(
        newId,
        null,
        Number(decoded.initialBalance || 0),
        decoded.accountName || 'Conta Corrente Principal'
      );
      user = db.prepare('SELECT id, name, email, onboarded FROM users WHERE id = ?').get(newId);
    }

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado. Faça login novamente.' });
    }

    // Garante que as contas e o saldo inicial do usuário nunca fiquem vazios ou zerados se o JWT tiver saldo salvo
    const accStats = db
      .prepare("SELECT COUNT(*) as count, COALESCE(SUM(initial_balance), 0) as totalInit FROM accounts WHERE user_id = ? AND type != 'credit_card'")
      .get(user.id);

    if (accStats.count === 0 && user.onboarded) {
      await ensureHydratedFromSupabase(user.email);
      const recheck = db
        .prepare("SELECT COUNT(*) as count FROM accounts WHERE user_id = ? AND type != 'credit_card'")
        .get(user.id);
      if (recheck.count === 0) {
        seedUserDefaults(
          user.id,
          null,
          Number(decoded.initialBalance || 0),
          decoded.accountName || 'Conta Corrente Principal'
        );
      }
    } else if (accStats.totalInit === 0 && Number(decoded.initialBalance || 0) > 0) {
      seedUserDefaults(
        user.id,
        null,
        Number(decoded.initialBalance),
        decoded.accountName || 'Conta Corrente Principal'
      );
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

export async function registerHandler(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Informe seu nome, um e-mail válido e uma senha com no mínimo 6 caracteres.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();

    // Verifica no Supabase se este e-mail já existe em outra instância
    await ensureHydratedFromSupabase(cleanEmail);

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (exists) {
      return res.status(409).json({ error: 'Este e-mail já possui uma conta cadastrada. Clique em "Entrar" para acessar.' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, onboarded) VALUES (?, ?, ?, 0)'
    ).run(String(name).trim(), cleanEmail, passwordHash);

    const userId = Number(result.lastInsertRowid);
    const user = { id: userId, name: String(name).trim(), email: cleanEmail, onboarded: 0 };
    const token = signToken(user);

    if (process.env.VERCEL) {
      await syncUserToSupabase(userId);
    } else {
      triggerBackgroundSupabaseSync(userId);
    }

    return res.status(201).json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar conta: ' + err.message });
  }
}

export async function loginHandler(req, res) {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

    if (!user) {
      await ensureHydratedFromSupabase(cleanEmail);
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    }

    if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    const safeUser = { id: user.id, name: user.name, email: user.email, onboarded: user.onboarded };
    const token = signToken(safeUser);
    return res.json({ token, user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no login: ' + err.message });
  }
}

export async function onboardingHandler(req, res) {
  try {
    const { accountName, initialBalance, categories } = req.body;
    const cleanBalance = Number(initialBalance) || 0;
    const cleanAccName = String(accountName || 'Conta Corrente Principal').trim();

    seedUserDefaults(
      req.user.id,
      Array.isArray(categories) ? categories : null,
      cleanBalance,
      cleanAccName
    );
    db.prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(req.user.id);
    const updatedUser = db.prepare('SELECT id, name, email, onboarded FROM users WHERE id = ?').get(req.user.id);
    const newToken = signToken(updatedUser, {
      initialBalance: cleanBalance,
      accountName: cleanAccName,
    });

    if (process.env.VERCEL) {
      await syncUserToSupabase(req.user.id);
    } else {
      triggerBackgroundSupabaseSync(req.user.id);
    }

    return res.json({ user: updatedUser, token: newToken });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao concluir onboarding: ' + err.message });
  }
}
