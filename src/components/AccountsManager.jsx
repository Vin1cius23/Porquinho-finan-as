import React, { useState } from 'react';
import {
  CreditCard,
  Wallet,
  CalendarClock,
  CalendarPlus,
  BellRing,
  Target,
  Plus,
  Trash2,
  AlertCircle,
  Edit3,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { formatCurrency, formatDateBR, parseMoneyInputBR } from '../utils/formatters.js';
import {
  addBillToDeviceCalendar,
  getGoogleCalendarUrl,
  requestAndSendBillNotification,
} from '../utils/calendar.js';

function getNextDueDateForDay(dueDay) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dToday = now.getDate();
  const safeDay = Math.min(28, Math.max(1, Number(dueDay) || 10));
  let targetYear = y;
  let targetMonth = m + 1;
  if (safeDay < dToday - 2) {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function getDaysUntil(isoDate) {
  if (!isoDate) return 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const t0 = new Date(`${todayStr}T12:00:00`);
  const t1 = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return Math.round((t1 - t0) / 86400000);
}

export default function AccountsManager({
  accounts,
  transactions,
  categories = [],
  goals,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onCreateTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
}) {
  // Estado para agendar nova conta próxima do vencimento
  const [showAddBill, setShowAddBill] = useState(false);
  const [billDesc, setBillDesc] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [billCategory, setBillCategory] = useState('Moradia');
  const [billAccount, setBillAccount] = useState('');
  const [billRecurring, setBillRecurring] = useState(true);
  const [autoCalendarAlert, setAutoCalendarAlert] = useState(true);

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState('checking');
  const [accBalance, setAccBalance] = useState('');
  const [accLimit, setAccLimit] = useState('');
  const [accClosing, setAccClosing] = useState('');
  const [accDue, setAccDue] = useState('');

  const [editingAccId, setEditingAccId] = useState(null);
  const [editAccBalance, setEditAccBalance] = useState('');

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');

  // 1. Filtra contas pendentes ou com vencimento próximo
  const txBills = transactions.filter((t) => {
    if (t.status === 'pending' || t.status === 'overdue') return true;
    if (!t.due_date) return false;
    const diffDays = getDaysUntil(t.due_date);
    return diffDays >= -5 && diffDays <= 15;
  });

  // 2. Inclui cartões de crédito que possuem dia de vencimento (ex: Vence dia 10) nos próximos 10 dias
  const creditCardBills = accounts
    .filter((a) => a.type === 'credit_card' && a.due_day)
    .map((card) => {
      const nextDue = getNextDueDateForDay(card.due_day);
      const diffDays = getDaysUntil(nextDue);
      // Calcula total gasto no cartão neste mês
      const currentMonth = nextDue.slice(0, 7);
      const cardSpent = transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            t.date?.startsWith(currentMonth) &&
            (t.account_name === card.name || t.payment_method === 'Crédito')
        )
        .reduce((acc, t) => acc + Number(t.amount || 0), 0);

      return {
        id: `card-due-${card.id}`,
        isCardReminder: true,
        description: `Fatura ${card.name}`,
        amount: cardSpent,
        due_date: nextDue,
        date: nextDue,
        category: 'Cartão de Crédito',
        account_name: card.name,
        is_recurring: true,
        status: 'pending',
        diffDays,
      };
    })
    .filter((cb) => cb.diffDays >= -2 && cb.diffDays <= 10);

  const upcomingBills = [
    ...txBills.map((b) => ({
      ...b,
      diffDays: getDaysUntil(b.due_date || b.date),
    })),
    ...creditCardBills.filter(
      (cb) =>
        !txBills.some((tb) =>
          tb.description?.toLowerCase().includes(cb.account_name.toLowerCase())
        )
    ),
  ].sort((a, b) => a.diffDays - b.diffDays);

  async function handleCreateBill(e) {
    e.preventDefault();
    const parsedVal = parseMoneyInputBR(billDesc && billAmount ? billAmount : '0');
    if (!billDesc.trim() || parsedVal <= 0) return;

    const chosenAccount = billAccount || accounts[0]?.name || 'Conta Corrente Principal';
    const newBillPayload = {
      description: billDesc.trim(),
      amount: parsedVal,
      date: billDueDate,
      due_date: billDueDate,
      category: billCategory || 'Moradia',
      type: 'expense',
      payment_method: 'Boleto',
      account_name: chosenAccount,
      is_recurring: billRecurring,
      status: 'pending',
      notes: 'Conta agendada com alerta de vencimento',
    };

    if (onCreateTransaction) {
      await onCreateTransaction(newBillPayload);
    }

    // Dispara notificação nativa do navegador/PWA e abre alerta no calendário do celular se marcado
    requestAndSendBillNotification(newBillPayload);
    if (autoCalendarAlert) {
      addBillToDeviceCalendar(newBillPayload);
    }

    setBillDesc('');
    setBillAmount('');
    setShowAddBill(false);
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    if (!accName.trim()) return;
    await onAddAccount({
      name: accName.trim(),
      type: accType,
      initial_balance: parseMoneyInputBR(accBalance),
      credit_limit: parseMoneyInputBR(accLimit),
      closing_day: accClosing ? Number(accClosing) : null,
      due_day: accDue ? Number(accDue) : null,
    });
    setAccName('');
    setAccBalance('');
    setAccLimit('');
    setAccClosing('');
    setAccDue('');
    setShowAddAccount(false);
  }

  async function handleSaveAccountBalance(acc) {
    const val = parseMoneyInputBR(editAccBalance);
    if (onUpdateAccount) {
      if (acc.type === 'credit_card') {
        await onUpdateAccount(acc.id, { credit_limit: val });
      } else {
        await onUpdateAccount(acc.id, { initial_balance: val });
      }
    }
    setEditingAccId(null);
  }

  async function handleCreateGoal(e) {
    e.preventDefault();
    if (!goalTitle.trim() || !goalTarget) return;
    await onAddGoal({
      title: goalTitle.trim(),
      target_amount: Number(goalTarget),
      current_amount: Number(goalCurrent) || 0,
      deadline: null,
    });
    setGoalTitle('');
    setGoalTarget('');
    setGoalCurrent('');
    setShowAddGoal(false);
  }

  function renderDueBadge(diffDays, isPaid) {
    if (isPaid) {
      return (
        <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
          Pago ✓
        </span>
      );
    }
    if (diffDays < 0) {
      return (
        <span className="px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
          Venceu há {Math.abs(diffDays)}d
        </span>
      );
    }
    if (diffDays === 0) {
      return (
        <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold animate-pulse">
          Vence HOJE!
        </span>
      );
    }
    if (diffDays === 1) {
      return (
        <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold">
          Vence Amanhã!
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
        Faltam {diffDays} dias
      </span>
    );
  }

  const categoryOptions =
    categories.length > 0
      ? categories.map((c) => c.name)
      : ['Moradia', 'Assinaturas', 'Dívidas', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Outros'];

  return (
    <div className="space-y-3 overflow-y-auto pb-4 pr-0.5">
      {/* 1. Contas Próximas do Vencimento + Alerta no Calendário */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <h3 className="font-bold text-xs sm:text-sm">Contas Próximas do Vencimento</h3>
              <p className="text-[11px] text-slate-400">
                Lembretes e alertas direto no calendário do seu celular
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {upcomingBills.length > 0 && (
              <button
                type="button"
                onClick={() => addBillToDeviceCalendar(upcomingBills)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-semibold cursor-pointer shadow-2xs"
                title="Exportar todas as contas com alarme para o Calendário do celular"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Alerta Geral</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAddBill((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              {showAddBill ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{showAddBill ? 'Fechar' : 'Agendar Conta'}</span>
            </button>
          </div>
        </div>

        {/* Formulário para agendar conta a pagar + criar alerta no calendário */}
        {showAddBill && (
          <form
            onSubmit={handleCreateBill}
            className="p-3 rounded-xl bg-amber-50/60 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 space-y-2.5 text-xs animate-pop-in"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Conta (ex: Luz, Aluguel, Internet)"
                value={billDesc}
                onChange={(e) => setBillDesc(e.target.value)}
                className="col-span-2 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-medium"
              />
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="Valor R$ (ex: 180,00)"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              />
              <input
                type="date"
                required
                value={billDueDate}
                onChange={(e) => setBillDueDate(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              />
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <select
                value={billAccount}
                onChange={(e) => setBillAccount(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.name}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalendarAlert}
                  onChange={(e) => setAutoCalendarAlert(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-amber-800 dark:text-amber-300">
                  🔔 Criar alerta automático no Calendário do celular (avisa 1 dia antes e no dia)
                </span>
              </label>

              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={billRecurring}
                  onChange={(e) => setBillRecurring(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Repetir lembrete todo mês (conta fixa/mensal)</span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Salvar Conta e Criar Alerta</span>
            </button>
          </form>
        )}

        {upcomingBills.length === 0 ? (
          <div className="text-xs text-slate-400 py-2 space-y-1">
            <p>Nenhuma conta pendente para os próximos dias.</p>
            <p className="text-[11px]">
              Toque em <strong>+ Agendar Conta</strong> acima ou digite no Chat IA:{' '}
              <em>&quot;Conta de luz de 180 vence dia 10&quot;</em>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingBills.map((bill) => {
              const isPaid = bill.status === 'paid';
              return (
                <div
                  key={bill.id}
                  className={`p-3 rounded-xl border space-y-2 ${
                    isPaid
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <AlertCircle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isPaid ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        />
                        <span className="font-semibold text-xs truncate">{bill.description}</span>
                        {renderDueBadge(bill.diffDays, isPaid)}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Vence: <strong>{formatDateBR(bill.due_date || bill.date)}</strong> •{' '}
                        {bill.account_name}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {Number(bill.amount) > 0 && (
                        <span className="font-bold text-xs text-rose-600 dark:text-rose-400">
                          {formatCurrency(bill.amount)}
                        </span>
                      )}

                      {!bill.isCardReminder && onUpdateTransaction && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateTransaction(bill.id, {
                              status: isPaid ? 'pending' : 'paid',
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500'
                          }`}
                        >
                          {isPaid ? 'Pago ✓' : 'Pagar'}
                        </button>
                      )}

                      {!bill.isCardReminder && onDeleteTransaction && (
                        <button
                          type="button"
                          onClick={() => onDeleteTransaction(bill.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Excluir conta agendada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Botões de Alerta no Calendário do Usuário */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-amber-200/60 dark:border-slate-800 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        addBillToDeviceCalendar(bill);
                        requestAndSendBillNotification(bill);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-semibold cursor-pointer transition"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Criar Alerta no Calendário (Celular)</span>
                    </button>

                    <a
                      href={getGoogleCalendarUrl(bill)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500 text-[11px] font-semibold transition"
                    >
                      <ExternalLink className="w-3 h-3 text-emerald-600" />
                      <span>Google Agenda</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Contas Bancárias & Cartões de Crédito */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-500 shrink-0" />
            <div>
              <h3 className="font-bold text-xs sm:text-sm">Minhas Contas & Cartões</h3>
              <p className="text-[11px] text-slate-400">Saldos iniciais e limites de fatura</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddAccount((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            {showAddAccount ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showAddAccount ? 'Fechar' : 'Adicionar'}</span>
          </button>
        </div>

        {showAddAccount && (
          <form
            onSubmit={handleCreateAccount}
            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 text-xs animate-pop-in"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Nome (ex: Nubank)"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              />
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              >
                <option value="checking">Conta Corrente</option>
                <option value="savings">Poupança</option>
                <option value="wallet">Carteira</option>
                <option value="credit_card">Cartão de Crédito</option>
              </select>

              {accType !== 'credit_card' ? (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Saldo Inicial (Ex: 2500 ou 2.500,00)"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  className="col-span-2 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                />
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Limite Cartão (R$)"
                    value={accLimit}
                    onChange={(e) => setAccLimit(e.target.value)}
                    className="col-span-2 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  />
                  <input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Dia Fechamento"
                    value={accClosing}
                    onChange={(e) => setAccClosing(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  />
                  <input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Dia Vencimento"
                    value={accDue}
                    onChange={(e) => setAccDue(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  />
                </>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
            >
              Salvar Conta / Cartão
            </button>
          </form>
        )}

        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {acc.type === 'credit_card' ? (
                    <CreditCard className="w-4 h-4 text-purple-500 shrink-0" />
                  ) : (
                    <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  <span className="font-bold text-xs truncate">{acc.name}</span>
                </div>
                {editingAccId === acc.id ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={editAccBalance}
                      onChange={(e) => setEditAccBalance(e.target.value)}
                      placeholder="Ex: 2500"
                      className="w-28 px-2 py-1 rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-xs font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveAccountBalance(acc)}
                      className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAccId(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {acc.type === 'credit_card'
                      ? `Limite: ${formatCurrency(acc.credit_limit)} • Fecha dia ${acc.closing_day || '-'} / Vence dia ${acc.due_day || '-'}`
                      : `Saldo Inicial: ${formatCurrency(acc.initial_balance)}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {acc.type === 'credit_card' && acc.due_day && (
                  <button
                    type="button"
                    onClick={() =>
                      addBillToDeviceCalendar({
                        id: `card-${acc.id}`,
                        description: `Vencimento Fatura ${acc.name}`,
                        amount: 0,
                        due_date: getNextDueDateForDay(acc.due_day),
                        category: 'Cartão de Crédito',
                        account_name: acc.name,
                        is_recurring: true,
                      })
                    }
                    className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[11px] font-semibold flex items-center gap-1 hover:bg-amber-100 cursor-pointer"
                    title="Criar alerta mensal de vencimento da fatura no Calendário"
                  >
                    <CalendarPlus className="w-3 h-3" />
                    <span>Alerta Dia {acc.due_day}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccId(acc.id);
                    setEditAccBalance(
                      String(acc.type === 'credit_card' ? acc.credit_limit || 0 : acc.initial_balance || 0)
                    );
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-100 cursor-pointer"
                  title="Editar saldo inicial"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteAccount(acc.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  title="Remover conta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Metas de Economia */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <h3 className="font-bold text-xs sm:text-sm">Metas de Economia</h3>
              <p className="text-[11px] text-slate-400">Ex.: Reserva de R$ 5.000 até dezembro</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddGoal((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
          >
            {showAddGoal ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showAddGoal ? 'Fechar' : 'Nova Meta'}</span>
          </button>
        </div>

        {showAddGoal && (
          <form
            onSubmit={handleCreateGoal}
            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 text-xs animate-pop-in"
          >
            <input
              type="text"
              required
              placeholder="Título da meta (ex: Viagem)"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                required
                placeholder="Meta Total (R$)"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Já guardado (R$)"
                value={goalCurrent}
                onChange={(e) => setGoalCurrent(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
            >
              Salvar Meta
            </button>
          </form>
        )}

        <div className="space-y-2.5">
          {goals.map((g) => {
            const pct =
              g.target_amount > 0
                ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100))
                : 0;
            return (
              <div
                key={g.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs truncate">{g.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateGoal(g.id, {
                          current_amount: Number(g.current_amount) + 100,
                        })
                      }
                      className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer"
                    >
                      + R$ 100
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteGoal(g.id)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className="h-full bg-blue-500 transition-all"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    Guardado: <strong>{formatCurrency(g.current_amount)}</strong> de{' '}
                    {formatCurrency(g.target_amount)}
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
