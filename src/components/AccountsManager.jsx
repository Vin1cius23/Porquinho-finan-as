import React, { useState } from 'react';
import {
  CreditCard,
  Wallet,
  CalendarClock,
  Target,
  Plus,
  Trash2,
  AlertCircle,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { formatCurrency, formatDateBR, parseMoneyInputBR } from '../utils/formatters.js';

export default function AccountsManager({
  accounts,
  transactions,
  goals,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onUpdateTransaction,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
}) {
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

  const now = new Date();
  const upcomingBills = transactions.filter((t) => {
    if (t.status === 'pending' || t.status === 'overdue') return true;
    if (!t.due_date) return false;
    const diffDays = Math.ceil((new Date(t.due_date) - now) / 86400000);
    return diffDays >= -5 && diffDays <= 7;
  });

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

  return (
    <div className="space-y-3 overflow-y-auto pb-4 pr-0.5">
      {/* 1. Contas a Pagar / Vencimentos nos próximos 7 dias */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <h3 className="font-bold text-xs sm:text-sm">Contas Próximas do Vencimento</h3>
            <p className="text-[11px] text-slate-400">Lembretes para os próximos 7 dias</p>
          </div>
        </div>

        {upcomingBills.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            Nenhuma conta pendente para os próximos 7 dias.
          </p>
        ) : (
          <div className="space-y-2">
            {upcomingBills.map((bill) => {
              const isPaid = bill.status === 'paid';
              return (
                <div
                  key={bill.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    isPaid
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isPaid ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      />
                      <span className="font-semibold text-xs truncate">{bill.description}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Vence: <strong>{formatDateBR(bill.due_date || bill.date)}</strong> • {bill.account_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-xs text-rose-600 dark:text-rose-400">
                      {formatCurrency(bill.amount)}
                    </span>
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
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2"
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
