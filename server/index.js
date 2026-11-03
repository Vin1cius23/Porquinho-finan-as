import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { db, WELCOME_MESSAGE } from './db.js';
import {
  authMiddleware,
  loginHandler,
  onboardingHandler,
  registerHandler,
} from './auth.js';
import {
  formatBRDate,
  formatBRL,
  getTodaySaoPaulo,
  interpretUserMessage,
} from './ai.js';
import {
  configureAndSyncSupabase,
  ensureHydratedFromSupabase,
  getSupabaseStatus,
  syncAllLocalToSupabase,
  triggerBackgroundSupabaseSync,
} from './supabase.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

// Em ambiente Serverless (Vercel), hidrata os dados do Supabase no cold start
app.use('/api', async (req, res, next) => {
  if (process.env.VERCEL) {
    await ensureHydratedFromSupabase();
  }
  next();
});

function getFormattedMessages(userId) {
  return db
    .prepare('SELECT * FROM chat_messages WHERE user_id = ? ORDER BY id ASC LIMIT 200')
    .all(userId)
    .map((m) => ({
      ...m,
      pending_action: m.pending_action_json ? JSON.parse(m.pending_action_json) : null,
    }));
}

function buildFinancialContext(userId, targetMonth = null) {
  const todayISO = getTodaySaoPaulo();
  const currentMonth = targetMonth || todayISO.slice(0, 7);

  const [yearNum, monthNum] = currentMonth.split('-').map(Number);
  const prevDate = new Date(yearNum, monthNum - 2, 15);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const allTransactions = db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC')
    .all(userId);

  const categories = db
    .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC')
    .all(userId);

  const accounts = db
    .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC')
    .all(userId);

  const goals = db
    .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id ASC')
    .all(userId);

  const monthTx = allTransactions.filter((t) => t.date.startsWith(currentMonth));
  const prevMonthTx = allTransactions.filter((t) => t.date.startsWith(prevMonth));

  const totalIncome = monthTx
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const totalExpense = monthTx
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const prevIncome = prevMonthTx
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const prevExpense = prevMonthTx
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const categoryMap = new Map();
  for (const c of categories) {
    categoryMap.set(c.name, {
      id: c.id,
      category: c.name,
      budget: Number(c.monthly_budget || 0),
      color: c.color,
      total: 0,
      prevTotal: 0,
    });
  }

  for (const t of monthTx) {
    if (t.type !== 'expense') continue;
    if (!categoryMap.has(t.category)) {
      categoryMap.set(t.category, {
        id: null,
        category: t.category,
        budget: 0,
        color: '#64748b',
        total: 0,
        prevTotal: 0,
      });
    }
    categoryMap.get(t.category).total += Number(t.amount);
  }

  for (const t of prevMonthTx) {
    if (t.type !== 'expense') continue;
    if (categoryMap.has(t.category)) {
      categoryMap.get(t.category).prevTotal += Number(t.amount);
    }
  }

  const byCategory = Array.from(categoryMap.values())
    .map((item) => ({
      ...item,
      percentage: totalExpense > 0 ? Math.round((item.total / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const topExpenses = monthTx
    .filter((t) => t.type === 'expense')
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      description: t.description,
      category: t.category,
      amount: Number(t.amount),
      date: t.date,
    }));

  const initialAccountsBalance = accounts
    .filter((a) => a.type !== 'credit_card')
    .reduce((acc, a) => acc + Number(a.initial_balance || 0), 0);

  const allPaidNet = allTransactions
    .filter((t) => t.status === 'paid')
    .reduce((acc, t) => acc + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);

  const currentTotalBalance = initialAccountsBalance + allPaidNet;
  const totalBudget = categories.reduce((acc, c) => acc + Number(c.monthly_budget || 0), 0);

  return {
    currentMonth,
    prevMonth,
    totalIncome,
    totalExpense,
    balanceMonth: totalIncome - totalExpense,
    prevIncome,
    prevExpense,
    currentTotalBalance,
    totalBudget,
    remainingBudget: Math.max(0, totalBudget - totalExpense),
    byCategory,
    topExpenses,
    allTransactions,
    categories,
    accounts,
    goals,
  };
}

function buildSnapshotResponse(user, month = null, extra = {}) {
  triggerBackgroundSupabaseSync();
  const ctx = buildFinancialContext(user.id, month);
  return {
    user,
    supabaseStatus: getSupabaseStatus(),
    messages: getFormattedMessages(user.id),
    transactions: ctx.allTransactions,
    categories: ctx.categories,
    accounts: ctx.accounts,
    goals: ctx.goals,
    summary: {
      currentMonth: ctx.currentMonth,
      prevMonth: ctx.prevMonth,
      totalIncome: ctx.totalIncome,
      totalExpense: ctx.totalExpense,
      balanceMonth: ctx.balanceMonth,
      prevIncome: ctx.prevIncome,
      prevExpense: ctx.prevExpense,
      currentTotalBalance: ctx.currentTotalBalance,
      totalBudget: ctx.totalBudget,
      remainingBudget: ctx.remainingBudget,
      byCategory: ctx.byCategory,
      topExpenses: ctx.topExpenses,
    },
    ...extra,
  };
}

// --- ROTAS SUPABASE CLOUD SYNC ---
app.get('/api/supabase/status', authMiddleware, async (req, res) => {
  const status = await syncAllLocalToSupabase();
  res.json({ supabaseStatus: status });
});

app.post('/api/supabase/connect', authMiddleware, async (req, res) => {
  try {
    const { apiKey } = req.body;
    const status = await configureAndSyncSupabase(apiKey);
    if (!status.connected) {
      return res.status(400).json({ error: status.error || 'Não foi possível conectar ao Supabase.', supabaseStatus: status });
    }
    return res.json({ supabaseStatus: status });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/auth/register', registerHandler);
app.post('/api/auth/login', loginHandler);
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
app.post('/api/auth/onboarding', authMiddleware, onboardingHandler);

// --- BOOTSTRAP COMPLETO DE DADOS ---
app.get('/api/bootstrap', authMiddleware, (req, res) => {
  const month = req.query.month || null;
  res.json(buildSnapshotResponse(req.user, month));
});

// --- CHAT COM IA (Retorna snapshot completo em 1 único round-trip!) ---
app.post('/api/chat/message', authMiddleware, async (req, res) => {
  try {
    const { content, month } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }
    const userId = req.user.id;
    const text = String(content).trim();

    // Verifica rascunho anterior ANTES de inserir a mensagem do usuário
    const lastAssistantMsg = db
      .prepare('SELECT * FROM chat_messages WHERE user_id = ? AND role = ? ORDER BY id DESC LIMIT 1')
      .get(userId, 'assistant');

    let partialDraft = null;
    if (lastAssistantMsg && lastAssistantMsg.pending_action_json && lastAssistantMsg.action_status === 'none') {
      try {
        const parsed = JSON.parse(lastAssistantMsg.pending_action_json);
        if (parsed && parsed._isPartialDraft) {
          partialDraft = parsed;
        }
      } catch {
        partialDraft = null;
      }
    }

    // Salva mensagem do usuário
    db.prepare(
      'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
    ).run(userId, 'user', text, 'none');

    const ctx = buildFinancialContext(userId, month);
    const aiResult = await interpretUserMessage({
      message: text,
      categories: ctx.categories.map((c) => c.name),
      accounts: ctx.accounts.map((a) => a.name),
      financialSummary: {
        totalIncome: ctx.totalIncome,
        totalExpense: ctx.totalExpense,
        byCategory: ctx.byCategory.filter((c) => c.total > 0 || c.budget > 0),
        topExpenses: ctx.topExpenses,
      },
      partialDraft,
    });

    // Trata comando de apagar último lançamento
    if (aiResult.intent === 'delete_last') {
      const lastTx = db
        .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1')
        .get(userId);

      if (!lastTx) {
        db.prepare(
          'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
        ).run(userId, 'assistant', 'Você ainda não possui lançamentos para apagar.', 'none');
        return res.json(buildSnapshotResponse(req.user, month));
      }

      db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(lastTx.id, userId);
      const replyText = `🗑️ Apaguei seu último lançamento: **${lastTx.description}** (${lastTx.category}) no valor de **${formatBRL(lastTx.amount)}** (${formatBRDate(lastTx.date)}).`;
      db.prepare(
        'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
      ).run(userId, 'assistant', replyText, 'none');
      return res.json(buildSnapshotResponse(req.user, month, { deletedTransactionId: lastTx.id }));
    }

    // Se ainda falta alguma informação essencial, salva o rascunho parcial com missing_field para exibir botões interativos
    if (aiResult.intent === 'ask_missing_info') {
      const draftPayload = JSON.stringify({
        ...(aiResult.transaction || {}),
        _isPartialDraft: true,
        missing_field: aiResult.missing_field || 'category',
      });
      db.prepare(
        'INSERT INTO chat_messages (user_id, role, content, pending_action_json, action_status) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, 'assistant', aiResult.reply, draftPayload, 'none');
      return res.json(buildSnapshotResponse(req.user, month));
    }

    // Se o lançamento está pronto para confirmação, exibe os botões Confirmar / Editar / Cancelar
    if (aiResult.intent === 'confirm_transaction' && aiResult.transaction) {
      const txPayload = JSON.stringify(aiResult.transaction);
      db.prepare(
        'INSERT INTO chat_messages (user_id, role, content, pending_action_json, action_status) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, 'assistant', aiResult.reply, txPayload, 'pending');
      return res.json(buildSnapshotResponse(req.user, month));
    }

    // Resposta de consulta ou conversa geral
    db.prepare(
      'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
    ).run(userId, 'assistant', aiResult.reply, 'none');
    return res.json(buildSnapshotResponse(req.user, month));
  } catch (err) {
    console.error('Erro no chat:', err);
    return res.status(500).json({ error: 'Erro ao processar mensagem: ' + err.message });
  }
});

// --- CONFIRMAR / EDITAR / CANCELAR LANÇAMENTO DO CHAT ---
app.post('/api/chat/action', authMiddleware, (req, res) => {
  try {
    const { messageId, action, updatedTransaction, month } = req.body;
    const userId = req.user.id;
    const msg = db
      .prepare('SELECT * FROM chat_messages WHERE id = ? AND user_id = ?')
      .get(messageId, userId);

    if (!msg || !msg.pending_action_json) {
      return res.status(404).json({ error: 'Ação pendente não encontrada.' });
    }

    if (action === 'cancel') {
      db.prepare('UPDATE chat_messages SET action_status = ? WHERE id = ?').run('cancelled', messageId);
      db.prepare(
        'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
      ).run(userId, 'assistant', 'Lançamento cancelado! Se precisar registrar outra coisa, é só falar.', 'none');
      return res.json(buildSnapshotResponse(req.user, month, { status: 'cancelled' }));
    }

    const txData = updatedTransaction || JSON.parse(msg.pending_action_json);
    const totalInstallments = Math.max(1, Number(txData.installments || 1));
    const baseAmount = Number(txData.amount || 0);
    if (baseAmount <= 0) {
      return res.status(400).json({ error: 'Valor inválido.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO transactions (
        user_id, date, description, category, type, amount, payment_method, account_name, is_recurring, installment_info, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
    `);

    const baseDate = new Date(`${txData.date || getTodaySaoPaulo()}T12:00:00-03:00`);
    const perInstallmentAmount = totalInstallments > 1
      ? Math.round((baseAmount / totalInstallments) * 100) / 100
      : baseAmount;

    const createdIds = [];
    for (let i = 0; i < totalInstallments; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      const isoDate = d.toISOString().slice(0, 10);
      const instInfo = totalInstallments > 1 ? `${i + 1}/${totalInstallments}` : (txData.installment_info || '');
      const r = insertStmt.run(
        userId,
        isoDate,
        txData.description || 'Lançamento',
        txData.category || 'Outros',
        txData.type === 'income' ? 'income' : 'expense',
        perInstallmentAmount,
        txData.payment_method || 'Débito',
        txData.account_name || 'Conta Principal',
        txData.is_recurring ? 1 : 0,
        instInfo,
        txData.notes || ''
      );
      createdIds.push(Number(r.lastInsertRowid));
    }

    db.prepare(
      'UPDATE chat_messages SET action_status = ?, pending_action_json = ? WHERE id = ?'
    ).run('confirmed', JSON.stringify(txData), messageId);

    const ctxAfter = buildFinancialContext(userId, month);
    const catInfo = ctxAfter.byCategory.find((c) => c.category === txData.category);
    let budgetTip = '';
    if (txData.type === 'expense' && catInfo && catInfo.budget > 0) {
      const pct = Math.round((catInfo.total / catInfo.budget) * 100);
      if (pct >= 100) {
        budgetTip = `\n\n🚨 *Atenção: Com este gasto, você atingiu **${pct}%** do orçamento mensal de **${catInfo.category}** (${formatBRL(catInfo.total)} de ${formatBRL(catInfo.budget)}).*`;
      } else if (pct >= 80) {
        budgetTip = `\n\n⚠️ *Aviso amigável: Você chegou a **${pct}%** do orçamento mensal de **${catInfo.category}** (${formatBRL(catInfo.total)} de ${formatBRL(catInfo.budget)}).*`;
      }
    }

    const confirmReply = totalInstallments > 1
      ? `✅ Salvo na planilha! Registrei **${totalInstallments} parcelas de ${formatBRL(perInstallmentAmount)}** em **${txData.category}**.${budgetTip}`
      : `✅ Lançamento de **${formatBRL(baseAmount)}** em **${txData.category}** salvo na planilha!${budgetTip}`;

    db.prepare(
      'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
    ).run(userId, 'assistant', confirmReply, 'none');

    return res.json(buildSnapshotResponse(req.user, month, { status: 'confirmed', createdIds }));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao confirmar lançamento: ' + err.message });
  }
});

// --- CRUD DE LANÇAMENTOS (PLANILHA INTERATIVA + IMPORTAÇÃO) ---
app.post('/api/transactions', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const items = Array.isArray(req.body.transactions) ? req.body.transactions : [req.body];
    const stmt = db.prepare(`
      INSERT INTO transactions (
        user_id, date, description, category, type, amount, payment_method, account_name, is_recurring, installment_info, notes, status, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdIds = [];
    for (const item of items) {
      const amount = Number(item.amount);
      if (!amount || amount <= 0) continue;
      const r = stmt.run(
        userId,
        item.date || getTodaySaoPaulo(),
        String(item.description || 'Lançamento').trim(),
        String(item.category || 'Outros').trim(),
        item.type === 'income' ? 'income' : 'expense',
        amount,
        String(item.payment_method || 'Débito').trim(),
        String(item.account_name || 'Conta Principal').trim(),
        item.is_recurring ? 1 : 0,
        String(item.installment_info || '').trim(),
        String(item.notes || '').trim(),
        item.status || 'paid',
        item.due_date || null
      );
      createdIds.push(Number(r.lastInsertRowid));
    }
    return res.status(201).json(buildSnapshotResponse(req.user, req.body.month || null, { createdIds }));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao salvar lançamento: ' + err.message });
  }
});

app.put('/api/transactions/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(id, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }

    const updated = {
      date: req.body.date ?? existing.date,
      description: req.body.description ?? existing.description,
      category: req.body.category ?? existing.category,
      type: req.body.type ?? existing.type,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : existing.amount,
      payment_method: req.body.payment_method ?? existing.payment_method,
      account_name: req.body.account_name ?? existing.account_name,
      is_recurring: req.body.is_recurring !== undefined ? (req.body.is_recurring ? 1 : 0) : existing.is_recurring,
      installment_info: req.body.installment_info ?? existing.installment_info,
      notes: req.body.notes ?? existing.notes,
      status: req.body.status ?? existing.status,
      due_date: req.body.due_date !== undefined ? req.body.due_date : existing.due_date,
    };

    db.prepare(`
      UPDATE transactions
      SET date = ?, description = ?, category = ?, type = ?, amount = ?,
          payment_method = ?, account_name = ?, is_recurring = ?, installment_info = ?, notes = ?, status = ?, due_date = ?
      WHERE id = ? AND user_id = ?
    `).run(
      updated.date,
      updated.description,
      updated.category,
      updated.type,
      updated.amount,
      updated.payment_method,
      updated.account_name,
      updated.is_recurring,
      updated.installment_info,
      updated.notes,
      updated.status,
      updated.due_date,
      id,
      userId
    );

    return res.json(buildSnapshotResponse(req.user, req.body.month || null));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar lançamento: ' + err.message });
  }
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return res.json(buildSnapshotResponse(req.user));
});

// --- CATEGORIAS E ORÇAMENTO ---
app.post('/api/categories', authMiddleware, (req, res) => {
  try {
    const { name, monthly_budget, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Informe o nome da categoria.' });
    db.prepare(
      'INSERT OR IGNORE INTO categories (user_id, name, monthly_budget, color) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, String(name).trim(), Number(monthly_budget) || 0, color || '#10b981');
    return res.status(201).json(buildSnapshotResponse(req.user));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authMiddleware, (req, res) => {
  try {
    const { name, monthly_budget } = req.body;
    const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });

    const newName = name ? String(name).trim() : cat.name;
    const newBudget = monthly_budget !== undefined ? Number(monthly_budget) : cat.monthly_budget;

    db.prepare('UPDATE categories SET name = ?, monthly_budget = ? WHERE id = ? AND user_id = ?').run(
      newName,
      newBudget,
      req.params.id,
      req.user.id
    );
    if (newName !== cat.name) {
      db.prepare('UPDATE transactions SET category = ? WHERE user_id = ? AND category = ?').run(
        newName,
        req.user.id,
        cat.name
      );
    }
    return res.json(buildSnapshotResponse(req.user));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return res.json(buildSnapshotResponse(req.user));
});

// --- CONTAS E CARTÕES ---
app.post('/api/accounts', authMiddleware, (req, res) => {
  try {
    const { name, type, initial_balance, credit_limit, closing_day, due_day } = req.body;
    if (!name) return res.status(400).json({ error: 'Informe o nome da conta ou cartão.' });
    db.prepare(`
      INSERT INTO accounts (user_id, name, type, initial_balance, credit_limit, closing_day, due_day)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      String(name).trim(),
      type || 'checking',
      Number(initial_balance) || 0,
      Number(credit_limit) || 0,
      closing_day ? Number(closing_day) : null,
      due_day ? Number(due_day) : null
    );
    return res.status(201).json(buildSnapshotResponse(req.user));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return res.json(buildSnapshotResponse(req.user));
});

// --- METAS DE ECONOMIA ---
app.post('/api/goals', authMiddleware, (req, res) => {
  const { title, target_amount, current_amount, deadline } = req.body;
  if (!title || !target_amount) return res.status(400).json({ error: 'Informe título e valor da meta.' });
  db.prepare(
    'INSERT INTO goals (user_id, title, target_amount, current_amount, deadline) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, String(title).trim(), Number(target_amount), Number(current_amount) || 0, deadline || null);
  return res.status(201).json(buildSnapshotResponse(req.user));
});

app.put('/api/goals/:id', authMiddleware, (req, res) => {
  const { current_amount, target_amount, title } = req.body;
  const g = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!g) return res.status(404).json({ error: 'Meta não encontrada.' });
  db.prepare('UPDATE goals SET title = ?, target_amount = ?, current_amount = ? WHERE id = ?').run(
    title ?? g.title,
    target_amount !== undefined ? Number(target_amount) : g.target_amount,
    current_amount !== undefined ? Number(current_amount) : g.current_amount,
    req.params.id
  );
  return res.json(buildSnapshotResponse(req.user));
});

app.delete('/api/goals/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return res.json(buildSnapshotResponse(req.user));
});

// --- PRIVACIDADE: APAGAR TODOS OS DADOS DO USUÁRIO ---
app.delete('/api/user/data', authMiddleware, (req, res) => {
  const userId = req.user.id;
  db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM goals WHERE user_id = ?').run(userId);
  db.prepare(
    'INSERT INTO chat_messages (user_id, role, content, action_status) VALUES (?, ?, ?, ?)'
  ).run(userId, 'assistant', WELCOME_MESSAGE, 'none');
  return res.json(buildSnapshotResponse(req.user));
});

// --- INICIALIZAÇÃO SERVIDOR EXPRESS + VITE ---
async function startServer() {
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Ativa sincronização automática com o GitHub sempre que arquivos forem alterados
    const { startGitAutoWatcher } = await import('../scripts/auto-git-sync.js');
    startGitAutoWatcher();
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`🚀 FinChat IA rodando em http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
