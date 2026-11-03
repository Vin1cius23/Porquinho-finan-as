import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Table2,
  BarChart3,
  CreditCard,
  Sun,
  Moon,
  LogOut,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Smartphone,
  Monitor,
  Eye,
  EyeOff,
  Wifi,
  BatteryCharging,
  Cloud,
  X,
} from 'lucide-react';
import AuthModal from './components/AuthModal.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import SpreadsheetView from './components/SpreadsheetView.jsx';
import MonthlySummary from './components/MonthlySummary.jsx';
import AccountsManager from './components/AccountsManager.jsx';
import { formatCurrency } from './utils/formatters.js';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('finchat_token') || '');
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('finchat_theme') === 'dark');

  // Inicia por padrão no Modo App Mobile (com moldura de celular no desktop e tela cheia nativa no smartphone)
  const [mobileShellMode, setMobileShellMode] = useState(true);
  // Abas da barra inferior mobile: 'chat' | 'sheet' | 'summary' | 'accounts'
  const [mobileTab, setMobileTab] = useState('chat');
  const [hideBalance, setHideBalance] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [messages, setMessages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);

  const [highlightedIds, setHighlightedIds] = useState([]);
  const [externalCategoryFilter, setExternalCategoryFilter] = useState('');
  const [toast, setToast] = useState(null);
  const [newSheetBadge, setNewSheetBadge] = useState(0);

  // Estado da integração com o Supabase (oeuomqygwnabyaikdjzx)
  const [supabaseStatus, setSupabaseStatus] = useState({
    connected: false,
    projectUrl: 'https://oeuomqygwnabyaikdjzx.supabase.co',
  });
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState('');
  const [supabaseConnecting, setSupabaseConnecting] = useState(false);

  function showToast(text) {
    setToast(text);
    setTimeout(() => {
      setToast((curr) => (curr === text ? null : curr));
    }, 2800);
  }

  function applySnapshot(data) {
    if (!data) return;
    if (data.user) setUser(data.user);
    if (data.supabaseStatus) setSupabaseStatus(data.supabaseStatus);
    if (data.messages) setMessages(data.messages);
    if (data.transactions) setTransactions(data.transactions);
    if (data.categories) setCategories(data.categories);
    if (data.accounts) setAccounts(data.accounts);
    if (data.goals) setGoals(data.goals);
    if (data.summary) setSummary(data.summary);
    if (Array.isArray(data.createdIds) && data.createdIds.length > 0) {
      setHighlightedIds(data.createdIds);
      setNewSheetBadge((n) => n + data.createdIds.length);
      setTimeout(() => setHighlightedIds([]), 3200);
    }
  }

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('finchat_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('finchat_theme', 'light');
    }
  }, [darkMode]);

  const fetchBootstrap = useCallback(
    async (customMonth = selectedMonth) => {
      if (!token) return;
      try {
        const res = await fetch(`/api/bootstrap?month=${encodeURIComponent(customMonth)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('finchat_token');
          setToken('');
          setUser(null);
          return;
        }
        const data = await res.json();
        applySnapshot(data);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      }
    },
    [token, selectedMonth]
  );

  useEffect(() => {
    fetchBootstrap(selectedMonth);
  }, [fetchBootstrap, selectedMonth]);

  function handleAuthSuccess(newToken, newUser) {
    localStorage.setItem('finchat_token', newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem('finchat_token');
    setToken('');
    setUser(null);
  }

  async function handleSendMessage(text) {
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      action_status: 'none',
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text, month: selectedMonth }),
      });
      if (res.ok) {
        const data = await res.json();
        applySnapshot(data);
        if (data.deletedTransactionId) {
          showToast('Último lançamento excluído!');
        }
      }
    } finally {
      setChatLoading(false);
    }
  }

  async function handleConfirmAction(messageId, action, updatedTransaction = null) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              action_status: action === 'cancel' ? 'cancelled' : 'confirmed',
              pending_action: updatedTransaction || m.pending_action,
            }
          : m
      )
    );
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messageId,
          action,
          updatedTransaction,
          month: selectedMonth,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        applySnapshot(data);
        if (action === 'confirm') {
          showToast('✅ Salvo na Planilha! Toque na aba Planilha para ver.');
        }
      }
    } finally {
      setChatLoading(false);
    }
  }

  async function handleUpdateTransaction(id, fields) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...fields } : t))
    );
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...fields, month: selectedMonth }),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Lançamento atualizado!');
    }
  }

  async function handleDeleteTransaction(id) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Lançamento removido.');
    }
  }

  async function handleCreateTransaction(newTx) {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...newTx, month: selectedMonth }),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Novo lançamento adicionado!');
    }
  }

  async function handleImportTransactions(rows) {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ transactions: rows, month: selectedMonth }),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast(`${rows.length} lançamentos importados!`);
    }
  }

  async function handleAddCategory(cat) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cat),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast(`Categoria "${cat.name}" criada!`);
    }
  }

  async function handleUpdateCategory(id, fields) {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Orçamento atualizado!');
    }
  }

  async function handleDeleteCategory(id) {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) applySnapshot(await res.json());
  }

  async function handleAddAccount(acc) {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(acc),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast(`Conta "${acc.name}" adicionada!`);
    }
  }

  async function handleDeleteAccount(id) {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) applySnapshot(await res.json());
  }

  async function handleAddGoal(goal) {
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(goal),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Meta criada!');
    }
  }

  async function handleUpdateGoal(id, fields) {
    const res = await fetch(`/api/goals/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Progresso da meta atualizado!');
    }
  }

  async function handleDeleteGoal(id) {
    const res = await fetch(`/api/goals/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) applySnapshot(await res.json());
  }

  async function handleWipeUserData() {
    if (!window.confirm('Tem certeza que deseja apagar todos os seus lançamentos e histórico do chat? Esta ação não pode ser desfeita.')) {
      return;
    }
    const res = await fetch('/api/user/data', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Seus dados foram apagados.');
    }
  }

  function handleDrillDownCategory(categoryName) {
    setExternalCategoryFilter(categoryName);
    setMobileTab('sheet');
    showToast(`Filtrando planilha por: ${categoryName}`);
  }

  async function handleConnectSupabase(e) {
    e.preventDefault();
    if (!supabaseKeyInput.trim()) return;
    setSupabaseConnecting(true);
    try {
      const res = await fetch('/api/supabase/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey: supabaseKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conectar com Supabase');
      setSupabaseStatus(data.supabaseStatus);
      setShowSupabaseModal(false);
      setSupabaseKeyInput('');
      showToast('☁️ Conectado e sincronizado com o Supabase!');
    } catch (err) {
      alert('Erro ao conectar com o Supabase: ' + err.message);
    } finally {
      setSupabaseConnecting(false);
    }
  }

  if (!token || !user || user.onboarded === 0) {
    return (
      <AuthModal
        user={user}
        token={token}
        onAuthSuccess={handleAuthSuccess}
        onOnboardingComplete={(updatedUser) => {
          setUser(updatedUser);
          fetchBootstrap();
        }}
      />
    );
  }

  // ============================================================================
  // VISÃO 1: EXPERIÊNCIA DE APP MOBILE NATIVO (Padrão)
  // ============================================================================
  if (mobileShellMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950/60 to-slate-950 flex flex-col items-center justify-center sm:p-4 select-none sm:select-auto">
        {/* Botão flutuante no Desktop para alternar entre Moldura de Celular e Tela Cheia */}
        <div className="hidden sm:flex items-center gap-3 mb-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold">
            <Smartphone className="w-3.5 h-3.5" />
            Modo App Mobile Interativo
          </span>
          <button
            type="button"
            onClick={() => setMobileShellMode(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <Monitor className="w-3.5 h-3.5" />
            Expandir para Desktop Lado a Lado
          </button>
        </div>

        {/* Moldura do Smartphone (100% da tela em celulares reais, 430x860 no desktop) */}
        <div className="w-full sm:w-[430px] h-screen sm:h-[860px] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 sm:rounded-[44px] sm:border-[10px] sm:border-slate-800 sm:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden relative">
          {/* Status Bar Nativa do Celular */}
          <div className="bg-emerald-800 dark:bg-slate-900 text-white px-6 pt-2 pb-1 flex items-center justify-between text-[11px] font-semibold shrink-0">
            <span>09:41</span>
            <div className="hidden sm:block w-24 h-4 rounded-full bg-black/50" />
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" />
              <BatteryCharging className="w-4 h-4" />
            </div>
          </div>

          {/* App Header Mobile com Saldo (estilo Nubank/Inter) e botão de ocultar saldo */}
          <header className="bg-emerald-700 dark:bg-slate-900 text-white px-4 pt-2 pb-3 border-b border-emerald-600/30 dark:border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-emerald-100/90">Olá, {user.name.split(' ')[0]} 👋</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-extrabold tracking-tight">
                    {hideBalance
                      ? 'R$ ••••••'
                      : formatCurrency(summary?.currentTotalBalance || 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHideBalance((v) => !v)}
                    className="p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
                    title="Mostrar / ocultar saldo"
                  >
                    {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Ações rápidas do topo mobile */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowSupabaseModal(true)}
                  className={`px-2 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                    supabaseStatus?.connected
                      ? 'bg-emerald-400/25 text-emerald-100 border border-emerald-300/40'
                      : 'bg-amber-400/20 text-amber-200 border border-amber-300/40'
                  }`}
                  title="Configurar / Ver sincronização Supabase"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{supabaseStatus?.connected ? 'Supabase OK' : 'Conectar DB'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
                  title="Tema claro / escuro"
                >
                  {darkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleWipeUserData}
                  className="p-2 rounded-full bg-white/10 hover:bg-rose-500/40 transition cursor-pointer"
                  title="Apagar meus dados"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Pílulas de Receitas e Despesas do mês no topo do App */}
            {summary && (
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMobileTab('summary')}
                  className="px-3 py-1.5 rounded-xl bg-white/12 hover:bg-white/20 flex items-center justify-between transition cursor-pointer"
                >
                  <span className="text-emerald-100">Entradas</span>
                  <strong className="text-white">
                    {hideBalance ? '••••' : formatCurrency(summary.totalIncome)}
                  </strong>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab('summary')}
                  className="px-3 py-1.5 rounded-xl bg-white/12 hover:bg-white/20 flex items-center justify-between transition cursor-pointer"
                >
                  <span className="text-rose-200">Saídas</span>
                  <strong className="text-white">
                    {hideBalance ? '••••' : formatCurrency(summary.totalExpense)}
                  </strong>
                </button>
              </div>
            )}
          </header>

          {/* Toast flutuante interno do App Mobile */}
          {toast && (
            <div className="absolute top-28 left-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/95 dark:bg-emerald-600 text-white text-xs font-semibold shadow-lg animate-pop-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white shrink-0" />
              <span className="truncate">{toast}</span>
            </div>
          )}

          {/* Modal de Conexão Direta com o Supabase (oeuomqygwnabyaikdjzx) */}
          {showSupabaseModal && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-pop-in">
              <div className="w-full bg-white dark:bg-slate-900 rounded-3xl p-5 space-y-3 border border-slate-200 dark:border-slate-800 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-emerald-500" />
                    <h3 className="font-bold text-sm">Banco Supabase Nuvem</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSupabaseModal(false)}
                    className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Projeto:</span>
                    <strong className="font-mono text-[11px]">oeuomqygwnabyaikdjzx</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <strong className={supabaseStatus?.connected ? 'text-emerald-500' : 'text-amber-500'}>
                      {supabaseStatus?.connected ? 'Conectado e Sincronizando' : 'Aguardando Chave API'}
                    </strong>
                  </div>
                </div>

                <form onSubmit={handleConnectSupabase} className="space-y-2.5 text-xs">
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Como você já rodou o SQL, cole abaixo a chave <strong>service_role (secret)</strong> do seu projeto para sincronizar todos os lançamentos em tempo real:
                  </p>
                  <a
                    href="https://supabase.com/dashboard/project/oeuomqygwnabyaikdjzx/settings/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="block text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                  >
                    👉 Abrir página de chaves do seu projeto no Supabase ↗
                  </a>
                  <input
                    type="password"
                    required
                    placeholder="Cole aqui a chave service_role / secret..."
                    value={supabaseKeyInput}
                    onChange={(e) => setSupabaseKeyInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={supabaseConnecting}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {supabaseConnecting ? 'Sincronizando com Supabase...' : 'Conectar e Enviar Dados Agora'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Corpo da Aba Ativa */}
          <main className="flex-1 overflow-hidden flex flex-col p-2">
            {mobileTab === 'chat' && (
              <ChatPanel
                messages={messages}
                categories={categories}
                accounts={accounts}
                onSendMessage={handleSendMessage}
                onConfirmAction={handleConfirmAction}
                loading={chatLoading}
              />
            )}

            {mobileTab === 'sheet' && (
              <SpreadsheetView
                transactions={transactions}
                categories={categories}
                accounts={accounts}
                highlightedIds={highlightedIds}
                externalCategoryFilter={externalCategoryFilter}
                onClearExternalFilter={() => setExternalCategoryFilter('')}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onImportTransactions={handleImportTransactions}
                onCreateTransaction={handleCreateTransaction}
                isMobileMode={true}
              />
            )}

            {mobileTab === 'summary' && (
              <MonthlySummary
                summary={summary}
                transactions={transactions}
                categories={categories}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                onAddCategory={handleAddCategory}
                onUpdateCategory={handleUpdateCategory}
                onDeleteCategory={handleDeleteCategory}
                onDrillDownCategory={handleDrillDownCategory}
              />
            )}

            {mobileTab === 'accounts' && (
              <AccountsManager
                accounts={accounts}
                transactions={transactions}
                goals={goals}
                onAddAccount={handleAddAccount}
                onDeleteAccount={handleDeleteAccount}
                onUpdateTransaction={handleUpdateTransaction}
                onAddGoal={handleAddGoal}
                onUpdateGoal={handleUpdateGoal}
                onDeleteGoal={handleDeleteGoal}
              />
            )}
          </main>

          {/* Barra de Navegação Inferior Nativa (Bottom Tab Bar) */}
          <nav className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 pt-1.5 pb-3 grid grid-cols-4 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('chat')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
                mobileTab === 'chat'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Chat IA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileTab('sheet');
                setNewSheetBadge(0);
              }}
              className={`relative flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
                mobileTab === 'sheet'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Table2 className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Planilha</span>
              {newSheetBadge > 0 && (
                <span className="absolute top-0.5 right-5 px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-bold animate-bounce">
                  +{newSheetBadge}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('summary')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
                mobileTab === 'summary'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Resumo</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('accounts')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
                mobileTab === 'accounts'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Carteira</span>
            </button>
          </nav>

          {/* Barra home indicator iOS/Android */}
          <div className="bg-white dark:bg-slate-900 pb-1.5 flex flex-col items-center shrink-0">
            <p className="text-[9px] text-slate-400 mb-1 px-3 text-center truncate w-full">
              Ferramenta de organização • Não substitui profissional financeiro
            </p>
            <div className="w-32 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VISÃO 2: MODO TELA CHEIA / DESKTOP LADO A LADO (Opcional via botão no topo)
  // ============================================================================
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {toast && (
        <div className="fixed bottom-12 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold shadow-xl animate-pop-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 shrink-0">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-base leading-tight">FinChat IA</h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Olá, {user.name}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setMobileTab('chat')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                mobileTab === 'chat' || mobileTab === 'sheet'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Chat + Planilha Lado a Lado</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('summary')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                mobileTab === 'summary'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Resumo Mensal & Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('accounts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                mobileTab === 'accounts'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Contas & Metas</span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileShellMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Voltar ao Modo App Mobile</span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-4 overflow-hidden flex flex-col">
        {(mobileTab === 'chat' || mobileTab === 'sheet') && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[calc(100vh-145px)] max-h-[calc(100vh-145px)]">
            <div className="lg:col-span-5 xl:col-span-4 h-full overflow-hidden">
              <ChatPanel
                messages={messages}
                categories={categories}
                accounts={accounts}
                onSendMessage={handleSendMessage}
                onConfirmAction={handleConfirmAction}
                loading={chatLoading}
              />
            </div>
            <div className="lg:col-span-7 xl:col-span-8 h-full overflow-hidden">
              <SpreadsheetView
                transactions={transactions}
                categories={categories}
                accounts={accounts}
                highlightedIds={highlightedIds}
                externalCategoryFilter={externalCategoryFilter}
                onClearExternalFilter={() => setExternalCategoryFilter('')}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onImportTransactions={handleImportTransactions}
                onCreateTransaction={handleCreateTransaction}
                isMobileMode={false}
              />
            </div>
          </div>
        )}

        {mobileTab === 'summary' && (
          <MonthlySummary
            summary={summary}
            transactions={transactions}
            categories={categories}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onDrillDownCategory={handleDrillDownCategory}
          />
        )}

        {mobileTab === 'accounts' && (
          <AccountsManager
            accounts={accounts}
            transactions={transactions}
            goals={goals}
            onAddAccount={handleAddAccount}
            onDeleteAccount={handleDeleteAccount}
            onUpdateTransaction={handleUpdateTransaction}
            onAddGoal={handleAddGoal}
            onUpdateGoal={handleUpdateGoal}
            onDeleteGoal={handleDeleteGoal}
          />
        )}
      </main>

      <footer className="px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5 shrink-0">
        <ShieldAlert className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>
          Aviso importante: O FinChat IA é uma ferramenta de organização financeira pessoal e não substitui a orientação de um profissional financeiro certificado.
        </span>
      </footer>
    </div>
  );
}
