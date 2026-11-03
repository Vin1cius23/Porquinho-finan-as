import React, { useState } from 'react';
import { MessageSquare, Wallet, CheckCircle2, ArrowRight, Sparkles, Lock } from 'lucide-react';

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
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [step, setStep] = useState(user && !user.onboarded ? 2 : 1); // Onboarding em 3 passos
  const [name, setName] = useState('');
  const [email, setEmail] = useState('demo@finchat.com.br');
  const [password, setPassword] = useState('123456');
  const [accountName, setAccountName] = useState('Conta Corrente Principal');
  const [initialBalance, setInitialBalance] = useState('1500');
  const [selectedCategories, setSelectedCategories] = useState(STANDARD_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-4 text-slate-100">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Cabeçalho com progresso de Onboarding em 3 passos */}
        <div className="bg-emerald-600 p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/20 rounded-xl">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FinChat IA</h1>
              <p className="text-xs text-emerald-100">Seu controle financeiro pessoal por conversa</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-medium">
            <span className={`px-2.5 py-1 rounded-full ${step === 1 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-700/60 text-emerald-100'}`}>
              1. Conta
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            <span className={`px-2.5 py-1 rounded-full ${step === 2 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-700/60 text-emerald-100'}`}>
              2. Saldo Inicial
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            <span className={`px-2.5 py-1 rounded-full ${step === 3 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-700/60 text-emerald-100'}`}>
              3. Categorias
            </span>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 shadow text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setEmail('');
                    setPassword('');
                    setError('');
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 shadow text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Criar Conta (Passo 1/3)
                </button>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Seu Nome
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Maria Silva"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {loading
                  ? 'Carregando...'
                  : mode === 'login'
                  ? 'Entrar no FinChat'
                  : 'Continuar para Saldo Inicial →'}
              </button>

              {mode === 'login' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('demo@finchat.com.br');
                      setPassword('123456');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Preencher credenciais de demonstração (demo@finchat.com.br / 123456)
                  </button>
                </div>
              )}
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <Wallet className="w-5 h-5" />
                <h2>Passo 2 de 3: Cadastre seu saldo inicial</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe sua conta principal e quanto você tem disponível hoje para o app acompanhar a evolução do seu saldo.
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Nome da Conta Principal
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
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
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
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
                <h2>Passo 3 de 3: Escolha suas categorias</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione as categorias que fazem sentido para sua rotina (você poderá criar ou editar depois):
              </p>

              <div className="grid grid-cols-2 gap-2">
                {STANDARD_CATEGORIES.map((cat) => {
                  const active = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition cursor-pointer ${
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
                {loading ? 'Preparando sua planilha...' : 'Concluir e Abrir o Chat 🚀'}
              </button>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            <span>Senhas criptografadas com bcrypt. Você pode exportar ou apagar seus dados a qualquer momento.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

