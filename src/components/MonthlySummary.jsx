import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  PieChart,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatMonthLabel(yyyyMm) {
  if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm;
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function shiftMonth(yyyyMm, delta) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthlySummary({
  summary,
  transactions,
  selectedMonth,
  onSelectMonth,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onDrillDownCategory,
}) {
  // Sub-aba para não poluir a tela mobile: 'categorias' | 'evolucao'
  const [subView, setSubView] = useState('categorias');
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatBudget, setNewCatBudget] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatBudget, setEditCatBudget] = useState('');
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const {
    totalIncome = 0,
    totalExpense = 0,
    balanceMonth = 0,
    prevExpense = 0,
    currentTotalBalance = 0,
    remainingBudget = 0,
    byCategory = [],
  } = summary || {};

  const biggestCategory = byCategory.find((c) => c.total > 0) || null;
  const expenseDiffPct =
    prevExpense > 0 ? Math.round(((totalExpense - prevExpense) / prevExpense) * 100) : null;

  const monthlySeries = useMemo(() => {
    const map = new Map();
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    for (const tx of sorted) {
      const m = tx.date.slice(0, 7);
      if (!map.has(m)) map.set(m, { month: m, income: 0, expense: 0 });
      const entry = map.get(m);
      if (tx.type === 'income') entry.income += Number(tx.amount);
      else entry.expense += Number(tx.amount);
    }
    const list = Array.from(map.values()).slice(-6);
    let running = currentTotalBalance - list.reduce((acc, x) => acc + (x.income - x.expense), 0);
    return list.map((item) => {
      running += item.income - item.expense;
      const [y, mm] = item.month.split('-');
      return {
        ...item,
        label: `${mm}/${y.slice(2)}`,
        cumulativeBalance: running,
      };
    });
  }, [transactions, currentTotalBalance]);

  const pieSlices = useMemo(() => {
    const active = byCategory.filter((c) => c.total > 0);
    const sum = active.reduce((acc, c) => acc + c.total, 0);
    if (sum <= 0) return [];
    let cumulative = 0;
    return active.map((c) => {
      const startAngle = (cumulative / sum) * 360;
      cumulative += c.total;
      return {
        ...c,
        dashArray: `${(c.total / sum) * 251.2} 251.2`,
        dashOffset: -((startAngle / 360) * 251.2),
      };
    });
  }, [byCategory]);

  async function handleCreateCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await onAddCategory({
      name: newCatName.trim(),
      monthly_budget: Number(newCatBudget) || 0,
    });
    setNewCatName('');
    setNewCatBudget('');
    setShowAddCat(false);
  }

  const incomeVsExpenseRatio =
    totalIncome + totalExpense > 0
      ? Math.round((totalIncome / (totalIncome + totalExpense)) * 100)
      : 50;

  return (
    <div className="space-y-3 overflow-y-auto pb-4 pr-0.5">
      {/* 1. Navegador de Mês Limpo e Direto */}
      <div className="bg-white dark:bg-slate-900 px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-2xs">
        <button
          type="button"
          onClick={() => onSelectMonth(shiftMonth(selectedMonth, -1))}
          className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          title="Mês anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {formatMonthLabel(selectedMonth)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSelectMonth(shiftMonth(selectedMonth, 1))}
          className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          title="Próximo mês"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Card Único de Balanço do Mês (Sem texto cortado!) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium">Resultado de {formatMonthLabel(selectedMonth)}</span>
            <div
              className={`text-xl font-extrabold ${
                balanceMonth >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {balanceMonth >= 0 ? '+ ' : ''}
              {formatCurrency(balanceMonth)}
            </div>
          </div>

          <div className="text-right text-[11px]">
            {expenseDiffPct !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg font-semibold ${
                  expenseDiffPct <= 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                }`}
              >
                {expenseDiffPct <= 0 ? (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                )}
                {Math.abs(expenseDiffPct)}% vs. mês ant.
              </span>
            ) : (
              <span className="text-slate-400">Mês ant.: {formatCurrency(prevExpense)}</span>
            )}
          </div>
        </div>

        {/* Barra visual Entradas vs Saídas */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              ⬆️ Receitas: {formatCurrency(totalIncome)}
            </span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              ⬇️ Gastos: {formatCurrency(totalExpense)}
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-rose-400/80 overflow-hidden flex">
            <div
              style={{ width: `${incomeVsExpenseRatio}%` }}
              className="h-full bg-emerald-500 transition-all duration-300"
            />
          </div>
        </div>

        {/* 2 Destaques lado a lado com bastante espaço */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Ainda pode gastar</span>
            </div>
            <div className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              {formatCurrency(remainingBudget)}
            </div>
          </div>

          <div
            onClick={() =>
              biggestCategory && onDrillDownCategory && onDrillDownCategory(biggestCategory.category)
            }
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <PieChart className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Maior gasto</span>
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
              {biggestCategory
                ? `${biggestCategory.category} (${biggestCategory.percentage}%)`
                : 'Nenhum'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Alternador Limpo entre "Gastos por Categoria" e "Evolução Mensal" */}
      <div className="grid grid-cols-2 gap-1 bg-slate-200/80 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSubView('categorias')}
          className={`py-2 rounded-lg transition cursor-pointer ${
            subView === 'categorias'
              ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
              : 'text-slate-500'
          }`}
        >
          🍕 Categorias & Orçamento
        </button>
        <button
          type="button"
          onClick={() => setSubView('evolucao')}
          className={`py-2 rounded-lg transition cursor-pointer ${
            subView === 'evolucao'
              ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
              : 'text-slate-500'
          }`}
        >
          📊 Gráficos do Mês
        </button>
      </div>

      {/* SUB-ABA 1: GRÁFICO DE ROSCA + LISTA DE ORÇAMENTO POR CATEGORIA */}
      {subView === 'categorias' && (
        <div className="space-y-3 animate-pop-in">
          {/* Rosca espaçosa + legenda lateral */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3">
              Distribuição dos Gastos (Toque para filtrar)
            </h3>

            {pieSlices.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhuma despesa registrada neste mês.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-90">
                    {pieSlices.map((s) => {
                      const isHovered = hoveredSlice?.category === s.category;
                      return (
                        <circle
                          key={s.category}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke={s.color || '#10b981'}
                          strokeWidth={isHovered ? '20' : '16'}
                          strokeDasharray={s.dashArray}
                          strokeDashoffset={s.dashOffset}
                          className="transition-all duration-150 cursor-pointer"
                          onMouseEnter={() => setHoveredSlice(s)}
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={() => onDrillDownCategory && onDrillDownCategory(s.category)}
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                    <span className="text-[10px] text-slate-400 truncate max-w-[78px]">
                      {hoveredSlice ? hoveredSlice.category : 'Total Gasto'}
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {formatCurrency(hoveredSlice ? hoveredSlice.total : totalExpense)}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-1.5 text-xs min-w-0">
                  {pieSlices.map((s) => (
                    <button
                      key={s.category}
                      type="button"
                      onClick={() => onDrillDownCategory && onDrillDownCategory(s.category)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.color || '#10b981' }}
                        />
                        <span className="truncate font-medium">{s.category}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-500">{formatCurrency(s.total)}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {s.percentage}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lista de Categorias e Limites de Orçamento (1 coluna limpa!) */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xs sm:text-sm">Orçamento por Categoria</h3>
                <p className="text-[11px] text-slate-400">
                  Alertas automáticos em 80% e 100% do limite
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCat((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                {showAddCat ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{showAddCat ? 'Fechar' : 'Nova'}</span>
              </button>
            </div>

            {showAddCat && (
              <form
                onSubmit={handleCreateCategory}
                className="p-3 rounded-xl bg-emerald-50/70 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 space-y-2 text-xs animate-pop-in"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nome (ex: Pets)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  />
                  <input
                    type="number"
                    placeholder="Limite R$ (ex: 300)"
                    value={newCatBudget}
                    onChange={(e) => setNewCatBudget(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                >
                  Salvar Categoria
                </button>
              </form>
            )}

            <div className="space-y-2.5">
              {byCategory.map((cat) => {
                const pct = cat.budget > 0 ? Math.round((cat.total / cat.budget) * 100) : 0;
                const isOver100 = cat.budget > 0 && pct >= 100;
                const isOver80 = cat.budget > 0 && pct >= 80 && pct < 100;
                const isEditing = editingCatId === cat.id && cat.id !== null;

                return (
                  <div
                    key={cat.category}
                    className={`p-3 rounded-xl border transition ${
                      isOver100
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20'
                        : isOver80
                        ? 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={editCatName}
                            onChange={(e) => setEditCatName(e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-emerald-500 bg-white dark:bg-slate-800 flex-1 min-w-0"
                          />
                          <input
                            type="number"
                            value={editCatBudget}
                            onChange={(e) => setEditCatBudget(e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-emerald-500 bg-white dark:bg-slate-800 w-20"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await onUpdateCategory(cat.id, {
                                name: editCatName,
                                monthly_budget: Number(editCatBudget) || 0,
                              });
                              setEditingCatId(null);
                            }}
                            className="p-1.5 rounded bg-emerald-600 text-white cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color || '#10b981' }}
                          />
                          <span className="font-semibold text-xs truncate">{cat.category}</span>
                          {(isOver80 || isOver100) && (
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                isOver100
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                              }`}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {isOver100 ? '100%' : '80%'}
                            </span>
                          )}
                        </div>
                      )}

                      {!isEditing && (
                        <div className="text-xs text-right shrink-0">
                          <strong className="text-slate-900 dark:text-white">
                            {formatCurrency(cat.total)}
                          </strong>
                          <span className="text-slate-400 text-[11px]">
                            {' '}
                            / {cat.budget > 0 ? formatCurrency(cat.budget) : 'Sem limite'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Barra de progresso */}
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, pct)}%` }}
                        className={`h-full transition-all duration-300 ${
                          isOver100
                            ? 'bg-rose-600'
                            : isOver80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                      />
                    </div>

                    {/* Linha inferior de ações rápidas */}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{cat.budget > 0 ? `${pct}% usado` : `${cat.percentage}% do mês`}</span>

                      <div className="flex items-center gap-1.5">
                        {cat.id && !isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateCategory(cat.id, {
                                  monthly_budget: Math.max(0, Number(cat.budget || 0) - 100),
                                })
                              }
                              className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-[10px] font-semibold hover:bg-slate-300 cursor-pointer"
                            >
                              -100
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateCategory(cat.id, {
                                  monthly_budget: Number(cat.budget || 0) + 100,
                                })
                              }
                              className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold hover:bg-emerald-200 cursor-pointer"
                            >
                              +100
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatId(cat.id);
                                setEditCatName(cat.category);
                                setEditCatBudget(String(cat.budget || 0));
                              }}
                              className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer"
                              title="Editar nome ou limite"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCategory(cat.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {onDrillDownCategory && (
                          <button
                            type="button"
                            onClick={() => onDrillDownCategory(cat.category)}
                            className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline ml-1 cursor-pointer"
                          >
                            <span>Ver</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 2: GRÁFICOS DE BARRAS E LINHA EM LARGURA TOTAL (Sem espremer!) */}
      {subView === 'evolucao' && (
        <div className="space-y-3 animate-pop-in">
          {/* Gráfico de Barras Largura Total */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Receitas vs. Despesas por Mês
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Toque em qualquer mês abaixo para alternar o resumo
            </p>

            <div className="h-44 flex items-end justify-around gap-2 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              {monthlySeries.map((m) => {
                const maxVal = Math.max(
                  1,
                  ...monthlySeries.map((x) => Math.max(x.income, x.expense))
                );
                const incHeight = Math.max(8, Math.round((m.income / maxVal) * 115));
                const expHeight = Math.max(8, Math.round((m.expense / maxVal) * 115));
                const isSelected = m.month === selectedMonth;
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => onSelectMonth(m.month)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-slate-800 ring-1 ring-emerald-500/50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-end gap-2 h-28">
                      <div
                        style={{ height: `${incHeight}px` }}
                        className="w-5 rounded-t-md bg-emerald-500 transition-all"
                        title={`Receitas ${m.label}: ${formatCurrency(m.income)}`}
                      />
                      <div
                        style={{ height: `${expHeight}px` }}
                        className="w-5 rounded-t-md bg-rose-400 transition-all"
                        title={`Despesas ${m.label}: ${formatCurrency(m.expense)}`}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500" /> Receitas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-rose-400" /> Despesas
              </span>
            </div>
          </div>

          {/* Gráfico de Linha Largura Total */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Evolução do Saldo Acumulado
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Saldo atual total: <strong className="text-emerald-500">{formatCurrency(currentTotalBalance)}</strong>
            </p>

            {monthlySeries.length > 0 ? (
              <svg viewBox="0 0 280 110" className="w-full h-36 overflow-visible">
                {(() => {
                  const vals = monthlySeries.map((m) => m.cumulativeBalance);
                  const minV = Math.min(...vals, 0);
                  const maxV = Math.max(...vals, 100);
                  const range = Math.max(1, maxV - minV);
                  const points = monthlySeries
                    .map((m, idx) => {
                      const x =
                        monthlySeries.length === 1
                          ? 140
                          : 30 + (idx / (monthlySeries.length - 1)) * 220;
                      const y = 80 - ((m.cumulativeBalance - minV) / range) * 55;
                      return `${x},${y}`;
                    })
                    .join(' ');
                  return (
                    <>
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                        points={points}
                      />
                      {monthlySeries.map((m, idx) => {
                        const x =
                          monthlySeries.length === 1
                            ? 140
                            : 30 + (idx / (monthlySeries.length - 1)) * 220;
                        const y = 80 - ((m.cumulativeBalance - minV) / range) * 55;
                        return (
                          <g key={m.month}>
                            <circle cx={x} cy={y} r="5" fill="#10b981" />
                            <text
                              x={x}
                              y={y - 10}
                              textAnchor="middle"
                              className="fill-emerald-600 dark:fill-emerald-400 text-[8px] font-bold"
                            >
                              {formatCurrency(m.cumulativeBalance)}
                            </text>
                            <text
                              x={x}
                              y={100}
                              textAnchor="middle"
                              className="fill-slate-400 text-[9px]"
                            >
                              {m.label}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Sem histórico suficiente
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
