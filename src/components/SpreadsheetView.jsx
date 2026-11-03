import React, { useState, useMemo, useRef } from 'react';
import {
  Download,
  Upload,
  Trash2,
  Copy,
  Plus,
  FileSpreadsheet,
  Search,
  ArrowUpDown,
  Check,
  LayoutList,
  Table2,
  Edit3,
  X,
} from 'lucide-react';
import {
  exportTransactionsToFile,
  formatCurrency,
  formatDateBR,
  parseImportedSpreadsheet,
} from '../utils/formatters.js';

const CATEGORY_EMOJIS = {
  Moradia: '🏠',
  Alimentação: '🍔',
  Transporte: '🚗',
  Saúde: '💊',
  Educação: '📚',
  Lazer: '🎉',
  Assinaturas: '📺',
  Dívidas: '💳',
  Investimentos: '📈',
  Outros: '📦',
};

export default function SpreadsheetView({
  transactions,
  categories,
  accounts,
  highlightedIds = [],
  externalCategoryFilter = '',
  onClearExternalFilter,
  onUpdateTransaction,
  onDeleteTransaction,
  onImportTransactions,
  onCreateTransaction,
  isMobileMode = true,
}) {
  // No modo mobile inicia na visão "cards" interativa por toque, mas permite alternar para "grid" (10 colunas)
  const [viewStyle, setViewStyle] = useState(isMobileMode ? 'cards' : 'grid');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState('');

  // Modal/Sheet de edição rápida para toque no celular
  const [mobileEditingTx, setMobileEditingTx] = useState(null);

  // Linha de adição rápida inline
  const [showQuickRow, setShowQuickRow] = useState(false);
  const [quickDesc, setQuickDesc] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCat, setQuickCat] = useState('Alimentação');
  const [quickType, setQuickType] = useState('expense');
  const [quickPayment, setQuickPayment] = useState('PIX');

  const fileInputRef = useRef(null);
  const effectiveCategory = externalCategoryFilter || filterCategory;

  const filteredTransactions = useMemo(() => {
    const list = transactions.filter((t) => {
      if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      if (effectiveCategory !== 'all' && t.category !== effectiveCategory) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterAccount !== 'all' && t.account_name !== filterAccount) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchDesc = (t.description || '').toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchCat = (t.category || '').toLowerCase().includes(q);
        if (!matchDesc && !matchNotes && !matchCat) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'amount') {
        cmp = Number(a.amount) - Number(b.amount);
      } else if (sortField === 'description') {
        cmp = (a.description || '').localeCompare(b.description || '');
      } else if (sortField === 'category') {
        cmp = (a.category || '').localeCompare(b.category || '');
      } else {
        cmp = (a.date || '').localeCompare(b.date || '') || a.id - b.id;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [transactions, filterMonth, effectiveCategory, filterType, filterAccount, searchTerm, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function startCellEdit(tx, field) {
    setEditingCell({ id: tx.id, field });
    setEditValue(tx[field] ?? '');
  }

  async function commitCellEdit(tx, field, customValue = undefined) {
    const valToSave = customValue !== undefined ? customValue : editValue;
    setEditingCell(null);
    if (String(valToSave) === String(tx[field] ?? '')) return;

    const payload = { [field]: field === 'amount' ? Number(valToSave) : valToSave };
    await onUpdateTransaction(tx.id, payload);
  }

  async function handleQuickRowSubmit(e) {
    e.preventDefault();
    const val = parseFloat(String(quickAmount).replace(',', '.'));
    if (!quickDesc.trim() || !val || val <= 0) return;
    await onCreateTransaction({
      date: new Date().toISOString().slice(0, 10),
      description: quickDesc.trim(),
      category: quickCat || categories[0]?.name || 'Outros',
      type: quickType,
      amount: val,
      payment_method: quickPayment,
      account_name: accounts[0]?.name || 'Conta Principal',
      is_recurring: false,
      installment_info: '',
      notes: '',
    });
    setQuickDesc('');
    setQuickAmount('');
    setShowQuickRow(false);
  }

  async function handleDuplicateRow(tx) {
    await onCreateTransaction({
      date: new Date().toISOString().slice(0, 10),
      description: tx.description,
      category: tx.category,
      type: tx.type,
      amount: Number(tx.amount),
      payment_method: tx.payment_method,
      account_name: tx.account_name,
      is_recurring: Boolean(tx.is_recurring),
      installment_info: tx.installment_info || '',
      notes: tx.notes || '',
    });
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedRows = await parseImportedSpreadsheet(file);
      if (parsedRows.length > 0) {
        await onImportTransactions(parsedRows);
      }
    } catch (err) {
      alert('Erro ao importar planilha: ' + err.message);
    } finally {
      e.target.value = '';
    }
  }

  async function handleSaveMobileEdit(e) {
    e.preventDefault();
    if (!mobileEditingTx) return;
    await onUpdateTransaction(mobileEditingTx.id, {
      description: mobileEditingTx.description,
      amount: Number(mobileEditingTx.amount),
      category: mobileEditingTx.category,
      type: mobileEditingTx.type,
      date: mobileEditingTx.date,
      payment_method: mobileEditingTx.payment_method,
      account_name: mobileEditingTx.account_name,
      is_recurring: Boolean(mobileEditingTx.is_recurring),
      installment_info: mobileEditingTx.installment_info || '',
      notes: mobileEditingTx.notes || '',
    });
    setMobileEditingTx(null);
  }

  const totalFilteredIncome = filteredTransactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const totalFilteredExpense = filteredTransactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + Number(t.amount), 0);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative">
      {/* Cabeçalho compacto Mobile-First */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-xs sm:text-sm">Planilha ({filteredTransactions.length})</h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Toque em qualquer item para editar
            </p>
          </div>
        </div>

        {/* Alternador Modo Cards Mobile vs Modo Tabela 10 Colunas + Exportar/Importar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewStyle('cards')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                viewStyle === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-500'
              }`}
              title="Visão de Cards Touch para Celular"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('grid')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                viewStyle === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-500'
              }`}
              title="Planilha Completa (10 Colunas)"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>10 Colunas</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowQuickRow((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] cursor-pointer"
            title="Importar planilha .xlsx ou .csv"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => exportTransactionsToFile(filteredTransactions, 'xlsx')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer"
            title="Exportar Excel (.xlsx)"
          >
            <Download className="w-3 h-3 text-emerald-600" />
            <span>XLSX</span>
          </button>

          <button
            type="button"
            onClick={() => exportTransactionsToFile(filteredTransactions, 'csv')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer"
            title="Exportar CSV (.csv)"
          >
            <Download className="w-3 h-3 text-blue-500" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Formulário rápido para adicionar lançamento */}
      {showQuickRow && (
        <form
          onSubmit={handleQuickRowSubmit}
          className="p-3 bg-emerald-50/90 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-800/60 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs animate-pop-in"
        >
          <input
            type="text"
            required
            autoFocus
            placeholder="Descrição (ex: Padaria)"
            value={quickDesc}
            onChange={(e) => setQuickDesc(e.target.value)}
            className="col-span-2 sm:flex-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <input
            type="number"
            step="0.01"
            required
            placeholder="Valor R$"
            value={quickAmount}
            onChange={(e) => setQuickAmount(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <select
            value={quickCat}
            onChange={(e) => setQuickCat(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            {categories.map((c) => (
              <option key={c.id || c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={quickType}
            onChange={(e) => setQuickType(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Salvar
          </button>
        </form>
      )}

      {/* Barra de busca e filtros compactos deslizantes */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar..."
            className="w-32 sm:w-40 pl-7 pr-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5 shrink-0">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'income', label: 'Receitas' },
            { id: 'expense', label: 'Despesas' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                filterType === tab.id
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={effectiveCategory}
          onChange={(e) => {
            if (onClearExternalFilter) onClearExternalFilter();
            setFilterCategory(e.target.value);
          }}
          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs shrink-0"
        >
          <option value="all">Categorias</option>
          {categories.map((c) => (
            <option key={c.id || c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs shrink-0"
        />

        {(filterMonth || effectiveCategory !== 'all' || filterType !== 'all' || filterAccount !== 'all' || searchTerm) && (
          <button
            type="button"
            onClick={() => {
              if (onClearExternalFilter) onClearExternalFilter();
              setFilterMonth('');
              setFilterCategory('all');
              setFilterType('all');
              setFilterAccount('all');
              setSearchTerm('');
            }}
            className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {/* CONTEÚDO PRINCIPAL: MODO CARDS TOUCH (MOBILE) OU MODO GRADE 10 COLUNAS */}
      <div className="flex-1 overflow-y-auto">
        {viewStyle === 'cards' ? (
          <div className="p-3 space-y-2.5">
            {filteredTransactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Nenhum lançamento encontrado. Volte ao Chat e diga o que gastou hoje!
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const isHighlighted = highlightedIds.includes(tx.id);
                return (
                  <div
                    key={tx.id}
                    onClick={() => setMobileEditingTx({ ...tx })}
                    className={`p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-emerald-400 active:scale-[0.99] transition flex items-center justify-between gap-3 cursor-pointer shadow-2xs ${
                      isHighlighted ? 'animate-row-flash ring-2 ring-emerald-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
                          tx.type === 'income'
                            ? 'bg-emerald-100 dark:bg-emerald-950/80'
                            : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                      >
                        {CATEGORY_EMOJIS[tx.category] || '💸'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {tx.description}
                          </p>
                          {tx.installment_info && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                              {tx.installment_info}
                            </span>
                          )}
                          {Boolean(tx.is_recurring) && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                              Fixo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {tx.category}
                          </span>
                          <span>•</span>
                          <span>{formatDateBR(tx.date)}</span>
                          <span>•</span>
                          <span>{tx.payment_method}</span>
                          <span>({tx.account_name})</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <span
                        className={`font-bold text-sm ${
                          tx.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
                      </span>
                      <div
                        className="flex items-center gap-1 mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setMobileEditingTx({ ...tx })}
                          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-emerald-600 cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(tx)}
                          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 cursor-pointer"
                          title="Duplicar"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Apagar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* MODO TABELA COMPLETA DE 10 COLUNAS */
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 sticky top-0 z-10 uppercase text-[10px] tracking-wider font-semibold select-none">
              <tr>
                <th
                  onClick={() => toggleSort('date')}
                  className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:text-emerald-600"
                >
                  <span className="inline-flex items-center gap-1">
                    Data <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </span>
                </th>
                <th
                  onClick={() => toggleSort('description')}
                  className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:text-emerald-600"
                >
                  <span className="inline-flex items-center gap-1">
                    Descrição <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </span>
                </th>
                <th
                  onClick={() => toggleSort('category')}
                  className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:text-emerald-600"
                >
                  <span className="inline-flex items-center gap-1">
                    Categoria <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </span>
                </th>
                <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700">Tipo</th>
                <th
                  onClick={() => toggleSort('amount')}
                  className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 text-right cursor-pointer hover:text-emerald-600"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Valor <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </span>
                </th>
                <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700">Pagamento</th>
                <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700">Conta/Cartão</th>
                <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 text-center">Recorrente</th>
                <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 text-center">Parcela</th>
                <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700">Observações</th>
                <th className="py-2.5 px-2 border-b border-slate-200 dark:border-slate-700 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.map((tx) => {
                const isEditing = (f) => editingCell?.id === tx.id && editingCell?.field === f;
                const isHighlighted = highlightedIds.includes(tx.id);
                return (
                  <tr
                    key={tx.id}
                    className={`hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 transition ${
                      isHighlighted ? 'animate-row-flash' : ''
                    }`}
                  >
                    <td
                      onClick={() => startCellEdit(tx, 'date')}
                      className="py-2 px-3 whitespace-nowrap cursor-pointer font-mono text-[11px]"
                    >
                      {isEditing('date') ? (
                        <input
                          type="date"
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitCellEdit(tx, 'date')}
                          onKeyDown={(e) => e.key === 'Enter' && commitCellEdit(tx, 'date')}
                          className="px-1 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        />
                      ) : (
                        formatDateBR(tx.date)
                      )}
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'description')}
                      className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 cursor-pointer min-w-[140px]"
                    >
                      {isEditing('description') ? (
                        <input
                          type="text"
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitCellEdit(tx, 'description')}
                          onKeyDown={(e) => e.key === 'Enter' && commitCellEdit(tx, 'description')}
                          className="w-full px-1.5 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        />
                      ) : (
                        tx.description
                      )}
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'category')}
                      className="py-2 px-3 whitespace-nowrap cursor-pointer"
                    >
                      {isEditing('category') ? (
                        <select
                          autoFocus
                          value={editValue}
                          onChange={(e) => commitCellEdit(tx, 'category', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          className="px-1.5 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        >
                          {categories.map((c) => (
                            <option key={c.id || c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {tx.category}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          commitCellEdit(tx, 'type', tx.type === 'income' ? 'expense' : 'income')
                        }
                        className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                          tx.type === 'income'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                        }`}
                      >
                        {tx.type === 'income' ? 'Receita' : 'Despesa'}
                      </button>
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'amount')}
                      className={`py-2 px-3 whitespace-nowrap text-right font-semibold cursor-pointer ${
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isEditing('amount') ? (
                        <input
                          type="number"
                          step="0.01"
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitCellEdit(tx, 'amount')}
                          onKeyDown={(e) => e.key === 'Enter' && commitCellEdit(tx, 'amount')}
                          className="w-24 px-1.5 py-0.5 text-right rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        />
                      ) : (
                        formatCurrency(tx.amount)
                      )}
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'payment_method')}
                      className="py-2 px-3 whitespace-nowrap cursor-pointer"
                    >
                      {isEditing('payment_method') ? (
                        <select
                          autoFocus
                          value={editValue}
                          onChange={(e) => commitCellEdit(tx, 'payment_method', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          className="px-1.5 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        >
                          {['Débito', 'Crédito', 'PIX', 'Dinheiro', 'Boleto', 'Transferência'].map((pm) => (
                            <option key={pm} value={pm}>
                              {pm}
                            </option>
                          ))}
                        </select>
                      ) : (
                        tx.payment_method
                      )}
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'account_name')}
                      className="py-2 px-3 whitespace-nowrap cursor-pointer"
                    >
                      {isEditing('account_name') ? (
                        <select
                          autoFocus
                          value={editValue}
                          onChange={(e) => commitCellEdit(tx, 'account_name', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          className="px-1.5 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        >
                          {accounts.map((a) => (
                            <option key={a.id || a.name} value={a.name}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        tx.account_name
                      )}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => commitCellEdit(tx, 'is_recurring', !tx.is_recurring)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${
                          tx.is_recurring
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {tx.is_recurring ? 'Sim' : 'Não'}
                      </button>
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'installment_info')}
                      className="py-2 px-3 text-center whitespace-nowrap cursor-pointer text-slate-500"
                    >
                      {isEditing('installment_info') ? (
                        <input
                          type="text"
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitCellEdit(tx, 'installment_info')}
                          onKeyDown={(e) => e.key === 'Enter' && commitCellEdit(tx, 'installment_info')}
                          className="w-16 px-1 py-0.5 text-center rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        />
                      ) : (
                        tx.installment_info || '-'
                      )}
                    </td>
                    <td
                      onClick={() => startCellEdit(tx, 'notes')}
                      className="py-2 px-3 text-slate-500 dark:text-slate-400 cursor-pointer min-w-[120px]"
                    >
                      {isEditing('notes') ? (
                        <input
                          type="text"
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitCellEdit(tx, 'notes')}
                          onKeyDown={(e) => e.key === 'Enter' && commitCellEdit(tx, 'notes')}
                          className="w-full px-1.5 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800"
                        />
                      ) : (
                        tx.notes || <span className="opacity-40">Nota...</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(tx)}
                          className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom Sheet Modal para editar todas as 10 colunas de um item tocado no Modo Mobile */}
      {mobileEditingTx && (
        <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-xs flex items-end justify-center animate-pop-in">
          <form
            onSubmit={handleSaveMobileEdit}
            className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-4 space-y-3 border-t border-slate-200 dark:border-slate-700 shadow-2xl max-h-[90%] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Editar Lançamento</h3>
              <button
                type="button"
                onClick={() => setMobileEditingTx(null)}
                className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={mobileEditingTx.description || ''}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={mobileEditingTx.amount || ''}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, amount: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Tipo
                </label>
                <select
                  value={mobileEditingTx.type}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, type: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Categoria
                </label>
                <select
                  value={mobileEditingTx.category}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, category: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {categories.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={mobileEditingTx.date}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, date: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Pagamento
                </label>
                <select
                  value={mobileEditingTx.payment_method}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, payment_method: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {['Débito', 'Crédito', 'PIX', 'Dinheiro', 'Boleto', 'Transferência'].map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Conta / Cartão
                </label>
                <select
                  value={mobileEditingTx.account_name}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, account_name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {accounts.map((a) => (
                    <option key={a.id || a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Parcela (ex: 2/10)
                </label>
                <input
                  type="text"
                  value={mobileEditingTx.installment_info || ''}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, installment_info: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center pt-4">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(mobileEditingTx.is_recurring)}
                    onChange={(e) =>
                      setMobileEditingTx({ ...mobileEditingTx, is_recurring: e.target.checked })
                    }
                    className="rounded text-emerald-600"
                  />
                  <span>Gasto Recorrente / Fixo</span>
                </label>
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  Observações
                </label>
                <input
                  type="text"
                  value={mobileEditingTx.notes || ''}
                  onChange={(e) =>
                    setMobileEditingTx({ ...mobileEditingTx, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTransaction(mobileEditingTx.id);
                  setMobileEditingTx(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-300 font-semibold text-xs cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rodapé compacto de somatória */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] shrink-0">
        <div className="flex items-center gap-3">
          <span>
            Entradas:{' '}
            <strong className="text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalFilteredIncome)}
            </strong>
          </span>
          <span>
            Saídas:{' '}
            <strong className="text-rose-600 dark:text-rose-400">
              {formatCurrency(totalFilteredExpense)}
            </strong>
          </span>
        </div>
        <strong
          className={
            totalFilteredIncome - totalFilteredExpense >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }
        >
          {formatCurrency(totalFilteredIncome - totalFilteredExpense)}
        </strong>
      </div>
    </div>
  );
}
