import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Wallet,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Lock,
  UserPlus,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react';

const STANDARD_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Assinaturas',
  'Dívidas',
  'Investimentos',
  'Outros',
];

export default function AuthModal({ user, token, onAuthSuccess, onOnboardingComplete }) {
  // Inicia na aba 'register' ou 'login' com campos em branco para que cada pessoa crie ou acesse sua própria conta
  const [mode, setMode] = useState('register'); // 'register' | 'login'
  const [step, setStep] = useState(user && !user.onboarded ? 2 : 1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [accountName, setAccountName] = useState('Conta Corrente Principal');
  const [initialBalance, setInitialBalance] = useState('0');
  const [selectedCategories, setSelectedCategories] = useState(STANDARD_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.onboarded === 0 && step === 1) {
      setStep(2);
    }
  }, [user, step]);

  async function handleStep1Submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na autenticação');

      onAuthSuccess(data.token, data.user);
      if (data.user.onboarded === 0) {
        setStep(2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickDemoLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@finchat.com.br', password: '123456' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao entrar na conta demo');
      onAuthSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinishOnboarding() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountName,
          initialBalance: parseFloat(String(initialBalance).replace(',', '.')) || 0,
          categories: selectedCategories,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no onboarding');
      onOnboardingComplete(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(cat) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-4 text-slate-100 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-pop-in">
        {/* Cabeçalho com progresso de Onboarding em 3 passos */}
        <div className="bg-emerald-600 p-5 sm:p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/20 rounded-2xl">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Porquinho Finanças</h1>
              <p className="text-xs text-emerald-100">
                Cada usuário tem sua própria planilha e chat privado
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium">
            <span
              className={`px-2.5 py-1 rounded-full ${
                step === 1 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-700/60 text-emerald-100'
              }`}
            >
              1. Sua Conta
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            <span
              className={`px-2.5 py-1 rounded-full ${
                step === 2 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-700/60 text-emerald-100'
              }`}
            >
              2. Saldo Inicial
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            <span
              className={`px-2.5 py-1 rounded-full ${
                step === 3 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-700/60 text-emerald-100'
              }`}
            >
              3. Categorias
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              {/* Abas Criar Minha Conta vs Já Tenho Conta */}
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 shadow-xs text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Criar Minha Conta</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 shadow-xs text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Já Tenho Conta</span>
                </button>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Como você quer ser chamado(a)?
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: João ou Maria"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Seu E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Sua Senha
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {loading
                  ? 'Aguarde...'
                  : mode === 'register'
                  ? 'Criar Minha Conta Gratuita →'
                  : 'Entrar na Minha Conta'}
              </button>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Apenas testar com a Conta de Demonstração</span>
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <Wallet className="w-5 h-5" />
                <h2>Passo 2 de 3: Seu saldo inicial</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe sua conta principal e quanto você tem disponível hoje (pode ser R$ 0 se preferir começar do zero).
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Nome da sua Conta Principal
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Saldo Atual em Conta (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition cursor-pointer"
              >
                Próximo: Escolher Categorias →
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <h2>Passo 3 de 3: Suas categorias</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione as categorias que você usa (você poderá criar novas categorias depois):
              </p>

              <div className="grid grid-cols-2 gap-2">
                {STANDARD_CATEGORIES.map((cat) => {
                  const active = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition cursor-pointer ${
                        active
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      <span>{cat}</span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={loading || selectedCategories.length === 0}
                onClick={handleFinishOnboarding}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Criando seu ambiente...' : 'Concluir e Abrir Meu App 🚀'}
              </button>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            <span>Dados isolados por usuário e sincronizados com segurança no Supabase.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
