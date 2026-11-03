import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { db } from '../server/db.js';

const { Client } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.includes('SUA-SENHA-AQUI')) {
    console.error('❌ Defina a variável DATABASE_URL no seu arquivo .env com a Connection String do Supabase.');
    console.error('   Você encontra ela no painel do Supabase em: Connect (topo da página) -> Transaction Pooler / URI');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Conectando ao banco PostgreSQL do Supabase...');
    await client.connect();

    const schemaPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📐 Criando tabelas, índices e políticas RLS no Supabase...');
    await client.query(schemaSql);
    console.log('✅ Estrutura de tabelas criada com sucesso no Supabase!');

    // Sincroniza dados locais do SQLite para o Supabase
    const users = db.prepare('SELECT * FROM users').all();
    console.log(`📤 Sincronizando ${users.length} usuário(s) e seus lançamentos locais para o Supabase...`);

    for (const u of users) {
      const userRes = await client.query(
        `INSERT INTO public.users (name, email, password_hash, onboarded)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [u.name, u.email, u.password_hash, Boolean(u.onboarded)]
      );
      const remoteUserId = userRes.rows[0].id;

      // Categorias
      const cats = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(u.id);
      for (const c of cats) {
        await client.query(
          `INSERT INTO public.categories (user_id, name, monthly_budget, color)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, name) DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget`,
          [remoteUserId, c.name, c.monthly_budget, c.color]
        );
      }

      // Contas
      const accs = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(u.id);
      const existingRemoteAccs = await client.query(
        'SELECT COUNT(*) as cnt FROM public.accounts WHERE user_id = $1',
        [remoteUserId]
      );
      if (Number(existingRemoteAccs.rows[0].cnt) === 0) {
        for (const a of accs) {
          await client.query(
            `INSERT INTO public.accounts (user_id, name, type, initial_balance, credit_limit, closing_day, due_day)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [remoteUserId, a.name, a.type, a.initial_balance, a.credit_limit, a.closing_day, a.due_day]
          );
        }
      }

      // Lançamentos
      const existingRemoteTxs = await client.query(
        'SELECT COUNT(*) as cnt FROM public.transactions WHERE user_id = $1',
        [remoteUserId]
      );
      if (Number(existingRemoteTxs.rows[0].cnt) === 0) {
        const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(u.id);
        for (const t of txs) {
          await client.query(
            `INSERT INTO public.transactions
             (user_id, date, description, category, type, amount, payment_method, account_name, is_recurring, installment_info, notes, status, due_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              remoteUserId,
              t.date,
              t.description,
              t.category,
              t.type,
              t.amount,
              t.payment_method,
              t.account_name,
              Boolean(t.is_recurring),
              t.installment_info || '',
              t.notes || '',
              t.status || 'paid',
              t.due_date || null,
            ]
          );
        }
      }
    }

    console.log('🎉 Banco de dados enviado e sincronizado com o Supabase com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao enviar para o Supabase:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
