-- =============================================================================
-- Créditos do Assistente IA por tenant (mensal)
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- =============================================================================

-- Colunas em tenants: limite mensal, uso do mês atual e data do próximo reset
alter table public.tenants
  add column if not exists ai_credits_limit integer not null default 50,
  add column if not exists ai_credits_used_this_month integer not null default 0,
  add column if not exists ai_credits_reset_at timestamptz;

-- Inicializar reset_at para tenants existentes: primeiro dia do próximo mês
update public.tenants
set ai_credits_reset_at = date_trunc('month', now()) + interval '1 month'
where ai_credits_reset_at is null;

comment on column public.tenants.ai_credits_limit is 'Limite de créditos IA por mês para este tenant (1 crédito = 1 turno de conversa)';
comment on column public.tenants.ai_credits_used_this_month is 'Créditos já usados no período atual (zerado no reset mensal)';
comment on column public.tenants.ai_credits_reset_at is 'Data/hora do próximo reset mensal (uso volta a 0)';
