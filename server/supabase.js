import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';

let supabaseClient = null;
let lastSyncStatus = {
  connected: false,
  projectUrl: process.env.SUPABASE_URL || 'https://oeuomqygwnabyaikdjzx.supabase.co',
  lastSyncAt: null,
  error: null,
};

export function initSupabaseClient() {
  const url = process.env.SUPABASE_URL || 'https://oeuomqygwnabyaikdjzx.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (
    !key ||
    key === 'cole-sua-chave-anon-public-aqui' ||
    key === 'sua-chave-anon-ou-publishable-aqui' ||
    key.trim().length < 20
  ) {
    supabaseClient = null;
    lastSyncStatus.connected = false;
    return null;
  }

  supabaseClient = createClient(url.trim(), key.trim(), {
    auth: { persistSession: false },
  });
  lastSyncStatus.projectUrl = url.trim();
  lastSyncStatus.connected = true;
  return supabaseClient;
}

initSupabaseClient();

export function getSupabaseStatus() {
  return lastSyncStatus;
}

export async function configureAndSyncSupabase(apiKey) {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 20) {
    throw new Error('Chave do Supabase inválida.');
  }

  process.env.SUPABASE_SERVICE_ROLE_KEY = cleanKey;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
      envContent = envContent.replace(/SUPABASE_SERVICE_ROLE_KEY=.*/g, `SUPABASE_SERVICE_ROLE_KEY=${cleanKey}`);
    } else {
      envContent += `\nSUPABASE_SERVICE_ROLE_KEY=${cleanKey}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch {
    // Em ambiente serverless read-only ignora escrita em arquivo .env
  }

  initSupabaseClient();
  return await syncAllLocalToSupabase();
}

/**
 * Sincroniza APENAS os dados do usuário logado (evita sobrescrever outros usuários em multi-tenant)
 */
export async function syncUserToSupabase(userId) {
  if (!supabaseClient) initSupabaseClient();
  if (!supabaseClient || !userId) return lastSyncStatus;

  try {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!u) return lastSyncStatus;

    // 1. Upsert do usuário pelo e-mail único
    const { data: remoteUser, error: userErr } = await supabaseClient
      .from('users')
      .upsert(
        {
          name: u.name,
          email: u.email,
          password_hash: u.password_hash,
          onboarded: Boolean(u.onboarded),
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single();

    if (userErr) throw new Error(userErr.message);
    const remoteUserId = remoteUser.id;

    // 2. Categorias deste usuário
    const localCats = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(u.id);
    await supabaseClient.from('categories').delete().eq('user_id', remoteUserId);
    if (localCats.length > 0) {
      await supabaseClient.from('categories').insert(
        localCats.map((c) => ({
          user_id: remoteUserId,
          name: c.name,
          monthly_budget: Number(c.monthly_budget || 0),
          color: c.color || '#10b981',
        }))
      );
    }

    // 3. Contas deste usuário
    const localAccs = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(u.id);
    await supabaseClient.from('accounts').delete().eq('user_id', remoteUserId);
    if (localAccs.length > 0) {
      await supabaseClient.from('accounts').insert(
        localAccs.map((a) => ({
          user_id: remoteUserId,
          name: a.name,
          type: a.type,
          initial_balance: Number(a.initial_balance || 0),
          credit_limit: Number(a.credit_limit || 0),
          closing_day: a.closing_day || null,
          due_day: a.due_day || null,
        }))
      );
    }

    // 4. Lançamentos deste usuário
    const localTxs = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(u.id);
    await supabaseClient.from('transactions').delete().eq('user_id', remoteUserId);
    if (localTxs.length > 0) {
      await supabaseClient.from('transactions').insert(
        localTxs.map((t) => ({
          user_id: remoteUserId,
          date: t.date,
          description: t.description,
          category: t.category,
          type: t.type,
          amount: Number(t.amount),
          payment_method: t.payment_method,
          account_name: t.account_name,
          is_recurring: Boolean(t.is_recurring),
          installment_info: t.installment_info || '',
          notes: t.notes || '',
          status: t.status || 'paid',
          due_date: t.due_date || null,
        }))
      );
    }

    // 5. Metas deste usuário
    const localGoals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(u.id);
    await supabaseClient.from('goals').delete().eq('user_id', remoteUserId);
    if (localGoals.length > 0) {
      await supabaseClient.from('goals').insert(
        localGoals.map((g) => ({
          user_id: remoteUserId,
          title: g.title,
          target_amount: Number(g.target_amount),
          current_amount: Number(g.current_amount || 0),
          deadline: g.deadline || null,
        }))
      );
    }

    // 6. Histórico do Chat deste usuário
    const localMsgs = db.prepare('SELECT * FROM chat_messages WHERE user_id = ? ORDER BY id ASC').all(u.id);
    await supabaseClient.from('chat_messages').delete().eq('user_id', remoteUserId);
    if (localMsgs.length > 0) {
      await supabaseClient.from('chat_messages').insert(
        localMsgs.map((m) => ({
          user_id: remoteUserId,
          role: m.role,
          content: m.content,
          pending_action_json: m.pending_action_json ? JSON.parse(m.pending_action_json) : null,
          action_status: m.action_status || 'none',
        }))
      );
    }

    lastSyncStatus = {
      connected: true,
      projectUrl: process.env.SUPABASE_URL || 'https://oeuomqygwnabyaikdjzx.supabase.co',
      lastSyncAt: new Date().toISOString(),
      error: null,
    };
    return lastSyncStatus;
  } catch (err) {
    lastSyncStatus = {
      connected: false,
      projectUrl: process.env.SUPABASE_URL || 'https://oeuomqygwnabyaikdjzx.supabase.co',
      lastSyncAt: null,
      error: err.message,
    };
    return lastSyncStatus;
  }
}

export async function syncAllLocalToSupabase() {
  const localUsers = db.prepare('SELECT id FROM users').all();
  let status = lastSyncStatus;
  for (const u of localUsers) {
    status = await syncUserToSupabase(u.id);
  }
  return status;
}

export function triggerBackgroundSupabaseSync(userId = null) {
  if (!supabaseClient) return;
  const fn = userId ? () => syncUserToSupabase(userId) : () => syncAllLocalToSupabase();
  fn().catch((err) => {
    console.warn('[Supabase Sync] Aviso:', err.message);
  });
}

let isHydrated = false;

/**
 * Hidrata um usuário específico ou todos os usuários do Supabase para o banco local
 * preservando o isolamento completo de cada conta.
 */
export async function ensureHydratedFromSupabase(forceRefreshEmail = null) {
  if (isHydrated && !forceRefreshEmail) return;
  if (!supabaseClient) initSupabaseClient();
  if (!supabaseClient) return;

  try {
    const query = supabaseClient.from('users').select('*');
    if (forceRefreshEmail) {
      query.eq('email', forceRefreshEmail.toLowerCase().trim());
    }
    const { data: remoteUsers } = await query;
    if (!remoteUsers || remoteUsers.length === 0) {
      isHydrated = true;
      return;
    }

    for (const ru of remoteUsers) {
      let localUser = db.prepare('SELECT * FROM users WHERE email = ?').get(ru.email);
      let localUserId;
      if (!localUser) {
        const res = db
          .prepare('INSERT INTO users (name, email, password_hash, onboarded) VALUES (?, ?, ?, ?)')
          .run(ru.name, ru.email, ru.password_hash, ru.onboarded ? 1 : 0);
        localUserId = Number(res.lastInsertRowid);
      } else {
        localUserId = localUser.id;
        db.prepare('UPDATE users SET name = ?, password_hash = ?, onboarded = ? WHERE id = ?').run(
          ru.name,
          ru.password_hash,
          ru.onboarded ? 1 : 0,
          localUserId
        );
      }

      // Hidrata categorias se vazio localmente
      const catCount = db.prepare('SELECT COUNT(*) as c FROM categories WHERE user_id = ?').get(localUserId).c;
      if (catCount === 0) {
        const { data: rCats } = await supabaseClient.from('categories').select('*').eq('user_id', ru.id);
        if (rCats && rCats.length > 0) {
          const insCat = db.prepare(
            'INSERT OR IGNORE INTO categories (user_id, name, monthly_budget, color) VALUES (?, ?, ?, ?)'
          );
          for (const c of rCats) {
            insCat.run(localUserId, c.name, Number(c.monthly_budget || 0), c.color || '#10b981');
          }
        }
      }

      // Hidrata contas se vazio localmente
      const accCount = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?').get(localUserId).c;
      if (accCount === 0) {
        const { data: rAccs } = await supabaseClient.from('accounts').select('*').eq('user_id', ru.id);
        if (rAccs && rAccs.length > 0) {
          const insAcc = db.prepare(
            'INSERT INTO accounts (user_id, name, type, initial_balance, credit_limit, closing_day, due_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );
          for (const a of rAccs) {
            insAcc.run(
              localUserId,
              a.name,
              a.type,
              Number(a.initial_balance || 0),
              Number(a.credit_limit || 0),
              a.closing_day,
              a.due_day
            );
          }
        }
      }

      // Hidrata lançamentos se vazio localmente
      const txCount = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = ?').get(localUserId).c;
      if (txCount === 0) {
        const { data: rTxs } = await supabaseClient.from('transactions').select('*').eq('user_id', ru.id);
        if (rTxs && rTxs.length > 0) {
          const insTx = db.prepare(`
            INSERT INTO transactions (
              user_id, date, description, category, type, amount, payment_method, account_name, is_recurring, installment_info, notes, status, due_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const t of rTxs) {
            insTx.run(
              localUserId,
              t.date,
              t.description,
              t.category,
              t.type,
              Number(t.amount),
              t.payment_method,
              t.account_name,
              t.is_recurring ? 1 : 0,
              t.installment_info || '',
              t.notes || '',
              t.status || 'paid',
              t.due_date || null
            );
          }
        }
      }

      // Hidrata metas se vazio localmente
      const goalCount = db.prepare('SELECT COUNT(*) as c FROM goals WHERE user_id = ?').get(localUserId).c;
      if (goalCount === 0) {
        const { data: rGoals } = await supabaseClient.from('goals').select('*').eq('user_id', ru.id);
        if (rGoals && rGoals.length > 0) {
          const insGoal = db.prepare(
            'INSERT INTO goals (user_id, title, target_amount, current_amount, deadline) VALUES (?, ?, ?, ?, ?)'
          );
          for (const g of rGoals) {
            insGoal.run(localUserId, g.title, Number(g.target_amount), Number(g.current_amount || 0), g.deadline);
          }
        }
      }

      // Hidrata histórico do chat se vazio localmente
      const msgCount = db.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE user_id = ?').get(localUserId).c;
      if (msgCount === 0) {
        const { data: rMsgs } = await supabaseClient
          .from('chat_messages')
          .select('*')
          .eq('user_id', ru.id)
          .order('id', { ascending: true });
        if (rMsgs && rMsgs.length > 0) {
          const insMsg = db.prepare(
            'INSERT INTO chat_messages (user_id, role, content, pending_action_json, action_status) VALUES (?, ?, ?, ?, ?)'
          );
          for (const m of rMsgs) {
            insMsg.run(
              localUserId,
              m.role,
              m.content,
              m.pending_action_json ? JSON.stringify(m.pending_action_json) : null,
              m.action_status || 'none'
            );
          }
        }
      }
    }

    isHydrated = true;
  } catch (err) {
    console.warn('[Supabase Hydrate] Aviso ao hidratar dados:', err.message);
  }
}
