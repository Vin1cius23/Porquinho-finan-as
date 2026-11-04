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
  Download,
  Edit3,
  X,
} from 'lucide-react';
import AuthModal from './components/AuthModal.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import SpreadsheetView from './components/SpreadsheetView.jsx';
import MonthlySummary from './components/MonthlySummary.jsx';
import AccountsManager from './components/AccountsManager.jsx';
import { formatCurrency, getCurrentMonthISO, getTodayISO, parseMoneyInputBR } from './utils/formatters.js';
import { addBillToDeviceCalendar, requestAndSendBillNotification } from './utils/calendar.js';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('finchat_token') || 'default');
  const [user, setUser] = useState({
    id: 1,
    name: 'Porquinho Finanças',
    email: 'demo@finchat.com.br',
    onboarded: 1,
  });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('finchat_theme') === 'dark');

  // Inicia por padrão no Modo App Mobile (com moldura de celular no desktop e tela cheia nativa no smartphone)
  const [mobileShellMode, setMobileShellMode] = useState(true);
  // Abas da barra inferior mobile: 'chat' | 'sheet' | 'summary' | 'accounts'
  const [mobileTab, setMobileTab] = useState('chat');
  const [hideBalance, setHideBalance] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthISO());
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

  // Estados de instalação do PWA (Progressive Web App)
  const [deferredPwaPrompt, setDeferredPwaPrompt] = useState(null);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [showPwaInstallModal, setShowPwaInstallModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceInputVal, setBalanceInputVal] = useState('');

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsStandalonePwa(standalone);

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['chat', 'sheet', 'summary', 'accounts'].includes(tabParam)) {
      setMobileTab(tabParam);
    }

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPwaPrompt(e);
    }
    function onAppInstalled() {
      setDeferredPwaPrompt(null);
      setIsStandalonePwa(true);
      showToast('🎉 App instalado com sucesso no seu aparelho!');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function handleInstallPwaClick() {
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      const { outcome } = await deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPwaPrompt(null);
      }
    } else {
      setShowPwaInstallModal(true);
    }
  }

  function showToast(text) {
    setToast(text);
    setTimeout(() => {
      setToast((curr) => (curr === text ? null : curr));
    }, 2800);
  }

  function applySnapshot(data) {
    if (!data) return;
    if (data.token) {
      localStorage.setItem('finchat_token', data.token);
      setToken(data.token);
    }
    if (data.user) setUser(data.user);
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
      try {
        const res = await fetch(`/api/bootstrap?month=${encodeURIComponent(customMonth)}`, {
          headers: { Authorization: `Bearer ${token || 'default'}` },
        });
        if (res.ok) {
          const data = await res.json();
          applySnapshot(data);
        }
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

  async function handleUpdateAccount(id, fields) {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      showToast('Saldo da conta atualizado!');
    }
  }

  async function handleSaveQuickBalance(e) {
    e.preventDefault();
    const newBal = parseMoneyInputBR(balanceInputVal);
    const res = await fetch('/api/accounts/balance', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ initial_balance: newBal }),
    });
    if (res.ok) {
      applySnapshot(await res.json());
      setShowBalanceModal(false);
      showToast(`✅ Saldo base atualizado para ${formatCurrency(newBal)}!`);
    }
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

  // ============================================================================
  // VISÃO 1: EXPERIÊNCIA DE APP MOBILE NATIVO (Padrão)
  // ============================================================================
  if (mobileShellMode) {
    return (
      <div className="h-[100dvh] w-full bg-emerald-800 dark:bg-slate-950 sm:bg-gradient-to-br sm:from-slate-950 sm:via-emerald-950/60 sm:to-slate-950 flex flex-col items-center justify-center sm:p-4 overflow-hidden select-none sm:select-auto">
        {/* Botão flutuante no Desktop para alternar entre Moldura de Celular e Tela Cheia */}
        <div className="hidden sm:flex items-center gap-3 mb-3 text-xs text-slate-300 shrink-0">
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

        {/* Moldura do Smartphone (100% dvh no celular real, 430x860 no desktop) */}
        <div className="w-full sm:w-[430px] h-[100dvh] sm:h-[860px] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 sm:rounded-[44px] sm:border-[10px] sm:border-slate-800 sm:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden relative">
          {/* Status Bar Simulada APENAS no Desktop (no celular real usa a barra nativa do iOS/Android) */}
          {!isStandalonePwa && (
            <div className="hidden sm:flex bg-emerald-800 dark:bg-slate-900 text-white px-6 pt-2 pb-1 items-center justify-between text-[11px] font-semibold shrink-0">
              <span>09:41</span>
              <div className="w-24 h-4 rounded-full bg-black/50" />
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                <BatteryCharging className="w-4 h-4" />
              </div>
            </div>
          )}

          {/* App Header Mobile com Safe-Area para Notch/Ilha Dinâmica do iPhone */}
          <header className="bg-emerald-700 dark:bg-slate-900 text-white px-3.5 pt-[max(env(safe-area-inset-top,0px),2.6rem)] sm:pt-2.5 pb-2.5 border-b border-emerald-600/30 dark:border-slate-800 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] text-emerald-100/90 truncate">
                    <strong>Porquinho Finanças</strong> 👋
                  </p>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBalanceInputVal(String(summary?.initialBalance || 0));
                      setShowBalanceModal(true);
                    }}
                    className="flex items-center gap-1 text-base sm:text-lg font-extrabold tracking-tight whitespace-nowrap hover:opacity-90 cursor-pointer"
                    title="Toque para ajustar seu saldo inicial/base"
                  >
                    <span>
                      {hideBalance
                        ? 'R$ ••••••'
                        : formatCurrency(summary?.currentTotalBalance || 0)}
                    </span>
                    <Edit3 className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideBalance((v) => !v)}
                    className="p-1 rounded-full hover:bg-white/10 transition cursor-pointer shrink-0"
                    title="Mostrar / ocultar saldo"
                  >
                    {hideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Ações rápidas compactas do topo mobile */}
              <div className="flex items-center gap-1 shrink-0">
                {!isStandalonePwa && (
                  <button
                    type="button"
                    onClick={handleInstallPwaClick}
                    className="px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 bg-white text-emerald-800 hover:bg-emerald-50 shadow-2xs transition cursor-pointer whitespace-nowrap"
                    title="Instalar Aplicativo (PWA)"
                  >
                    <Download className="w-3 h-3 shrink-0" />
                    <span>App</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
                  title="Tema claro / escuro"
                >
                  {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleWipeUserData}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-rose-500/40 transition cursor-pointer"
                  title="Zerar lançamentos"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pílulas de Receitas e Despesas do mês no topo do App */}
            {summary && (
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setBalanceInputVal(String(summary?.initialBalance || 0));
                    setShowBalanceModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/12 hover:bg-white/20 flex items-center justify-between transition cursor-pointer"
                  title="Toque para definir ou ajustar seu saldo inicial"
                >
                  <span className="text-emerald-100">
                    {(summary.initialBalance || 0) > 0 ? 'Saldo + Entradas' : 'Entradas'}
                  </span>
                  <strong className="text-white">
                    {hideBalance
                      ? '••••'
                      : formatCurrency((summary.initialBalance || 0) + (summary.totalIncome || 0))}
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

          {/* Modal Rápido para Ajustar Saldo Inicial / Base da Conta */}
          {showBalanceModal && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-pop-in">
              <form
                onSubmit={handleSaveQuickBalance}
                className="w-full bg-white dark:bg-slate-900 rounded-3xl p-5 space-y-3.5 border border-slate-200 dark:border-slate-800 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Ajustar Saldo Inicial em Conta (R$)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowBalanceModal(false)}
                    className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Informe o valor total que você tinha em conta antes dos gastos. Todos os gastos registrados serão descontados automaticamente deste valor:
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  placeholder="Ex: 2500 ou 2.500,00"
                  value={balanceInputVal}
                  onChange={(e) => setBalanceInputVal(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-bold outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBalanceModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
                  >
                    Salvar Saldo
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Toast flutuante interno do App Mobile */}
          {toast && (
            <div className="absolute top-28 left-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/95 dark:bg-emerald-600 text-white text-xs font-semibold shadow-lg animate-pop-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white shrink-0" />
              <span className="truncate">{toast}</span>
            </div>
          )}

          {/* Modal de Instalação do PWA (iOS / Android / Desktop) */}
          {showPwaInstallModal && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-pop-in">
              <div className="w-full bg-white dark:bg-slate-900 rounded-3xl p-5 space-y-3.5 border border-slate-200 dark:border-slate-800 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                    <h3 className="font-bold text-sm">Instalar o App no Celular (PWA)</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPwaInstallModal(false)}
                    className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 space-y-1">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">
                      🤖 No Android (Chrome / Samsung Internet):
                    </p>
                    <p>
                      Toque nos <strong>3 pontinhos (⋮)</strong> no canto superior do navegador e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      🍎 No iPhone / iOS (Safari):
                    </p>
                    <p>
                      Toque no botão <strong>Compartilhar (⬆️)</strong> na barra inferior do Safari e depois em <strong>"Adicionar à Tela de Início"</strong>.
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      💻 No Computador (Chrome / Edge):
                    </p>
                    <p>
                      Clique no ícone de <strong>Instalar (📲)</strong> que aparece no lado direito da barra de endereços (`porquinho-financ-as.vercel.app`).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPwaInstallModal(false)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
                >
                  Entendi!
                </button>
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
                onUpdateAccount={handleUpdateAccount}
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

          {/* Barra home indicator iOS/Android com safe-area-inset-bottom */}
          <div className="bg-white dark:bg-slate-900 pb-[max(env(safe-area-inset-bottom,0px),0.4rem)] flex flex-col items-center shrink-0">
            <p className="text-[9px] text-slate-400 mb-1 px-3 text-center truncate w-full">
              Ferramenta de organização • Não substitui profissional financeiro
            </p>
            <div className="hidden sm:block w-32 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
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
            onUpdateAccount={handleUpdateAccount}
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
