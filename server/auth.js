import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, seedUserDefaults } from './db.js';
import {
  ensureHydratedFromSupabase,
  syncUserToSupabase,
  triggerBackgroundSupabaseSync,
} from './supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'finchat-dev-secret-key-2026';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
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

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado. Faça login novamente.' });
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
    seedUserDefaults(
      req.user.id,
      Array.isArray(categories) ? categories : null,
      Number(initialBalance) || 0,
      accountName || 'Conta Principal'
    );
    db.prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(req.user.id);
    const updatedUser = db.prepare('SELECT id, name, email, onboarded FROM users WHERE id = ?').get(req.user.id);

    if (process.env.VERCEL) {
      await syncUserToSupabase(req.user.id);
    } else {
      triggerBackgroundSupabaseSync(req.user.id);
    }

    return res.json({ user: updatedUser });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao concluir onboarding: ' + err.message });
  }
}
