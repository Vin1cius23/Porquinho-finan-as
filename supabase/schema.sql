-- =============================================================================
-- ESQUEMA POSTGRESQL / SUPABASE PARA O FINCHAT IA (PORQUINHO FINANÇAS)
-- Como usar no painel do Supabase (https://supabase.com/dashboard):
-- 1. Abra seu projeto no Supabase -> menu lateral "SQL Editor" -> "New query"
-- 2. Cole todo este conteúdo e clique em "Run" (Executar)
-- =============================================================================

-- 1. Tabela de Usuários do App
CREATE TABLE IF NOT EXISTS public.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabela de Contas Bancárias, Carteira e Cartões de Crédito
CREATE TABLE IF NOT EXISTS public.accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'wallet', 'credit_card')),
  initial_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  closing_day SMALLINT CHECK (closing_day IS NULL OR (closing_day BETWEEN 1 AND 31)),
  due_day SMALLINT CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);

-- 3. Tabela de Categorias e Orçamento Mensal
CREATE TABLE IF NOT EXISTS public.categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#10b981',
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);

-- 4. Tabela de Lançamentos Financeiros (Planilha em Tempo Real)
CREATE TABLE IF NOT EXISTS public.transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'Débito',
  account_name TEXT NOT NULL DEFAULT 'Conta Principal',
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  installment_info TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'overdue')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category);

-- 5. Tabela de Metas de Economia
CREATE TABLE IF NOT EXISTS public.goals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_amount NUMERIC(12, 2) NOT NULL,
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);

-- 6. Tabela de Mensagens do Chat com IA
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  pending_action_json JSONB,
  action_status TEXT NOT NULL DEFAULT 'none' CHECK (action_status IN ('none', 'pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id, id ASC);

-- =============================================================================
-- SEGURANÇA: ROW LEVEL SECURITY (RLS) ATIVADO EM TODAS AS TABELAS PÚBLICAS
-- =============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

