-- =============================================================================
-- MIGRAÇÃO MULTI-TENANT - Um banco, várias oficinas (isolamento por tenant_id)
-- Execute este script UMA VEZ no SQL Editor do Supabase (Dashboard > SQL Editor)
-- =============================================================================

-- 1) Tabela de inquilinos (uma linha = uma oficina)
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

-- Tenant padrão para dados já existentes (sua primeira oficina)
insert into public.tenants (id, name, slug)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Oficina Padrão',
  'oficina-padrao'
)
on conflict do nothing;

-- Campos opcionais por oficina para personalização de PDFs / identidade visual
alter table public.tenants
  add column if not exists display_name text,
  add column if not exists logo_url text,
  add column if not exists status text default 'active' check (status in ('active','paused'));

-- 2) Criar tabela profiles se não existir, depois adicionar tenant_id
do $$ begin
  -- Criar tipo user_role se não existir
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'manager', 'operator');
  end if;
  
  -- Criar tabela profiles se não existir
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    create table public.profiles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null unique,
      full_name text,
      role public.user_role not null default 'operator',
      created_at timestamptz not null default now()
    );
    
    -- Habilitar RLS
    alter table public.profiles enable row level security;
    
    -- Políticas básicas de RLS
    create policy "Self can read own profile" on public.profiles
      for select using (auth.uid() = user_id);
    create policy "Self can update own profile" on public.profiles
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  
  -- Adicionar tenant_id se não existir
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'tenant_id'
  ) then
    alter table public.profiles add column tenant_id uuid references public.tenants(id) on delete restrict;
  end if;
end $$;

-- Atribuir todos os usuários atuais ao tenant padrão
update public.profiles
set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
where tenant_id is null;

-- 3) Adicionar tenant_id em todas as tabelas de negócio
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'tenant_id') then
    alter table public.customers add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicles' and column_name = 'tenant_id') then
    alter table public.vehicles add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'suppliers' and column_name = 'tenant_id') then
    alter table public.suppliers add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'service_items' and column_name = 'tenant_id') then
    alter table public.service_items add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'tenant_id') then
    alter table public.quotes add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quote_items' and column_name = 'tenant_id') then
    alter table public.quote_items add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'service_orders' and column_name = 'tenant_id') then
    alter table public.service_orders add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maintenance_reminders' and column_name = 'tenant_id') then
    alter table public.maintenance_reminders add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'tenant_id') then
    alter table public.stock_movements add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicle_mileage_history' and column_name = 'tenant_id') then
    alter table public.vehicle_mileage_history add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
end $$;

-- 4) Preencher tenant_id nos dados existentes (tenant padrão) - apenas se as tabelas existirem
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customers') then
    update public.customers set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicles') then
    update public.vehicles set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'suppliers') then
    update public.suppliers set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_items') then
    update public.service_items set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quotes') then
    update public.quotes set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quote_items') then
    update public.quote_items set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_orders') then
    update public.service_orders set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maintenance_reminders') then
    update public.maintenance_reminders set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_movements') then
    update public.stock_movements set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicle_mileage_history') then
    update public.vehicle_mileage_history set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  end if;
end $$;

-- 5) Tornar tenant_id obrigatório (apenas se as tabelas existirem)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    alter table public.profiles alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customers') then
    alter table public.customers alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicles') then
    alter table public.vehicles alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'suppliers') then
    alter table public.suppliers alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_items') then
    alter table public.service_items alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quotes') then
    alter table public.quotes alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quote_items') then
    alter table public.quote_items alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_orders') then
    alter table public.service_orders alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maintenance_reminders') then
    alter table public.maintenance_reminders alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_movements') then
    alter table public.stock_movements alter column tenant_id set not null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicle_mileage_history') then
    alter table public.vehicle_mileage_history alter column tenant_id set not null;
  end if;
end $$;

-- 6) Índices por tenant (performance)
create index if not exists idx_customers_tenant_id on public.customers(tenant_id);
create index if not exists idx_vehicles_tenant_id on public.vehicles(tenant_id);
create index if not exists idx_suppliers_tenant_id on public.suppliers(tenant_id);
create index if not exists idx_service_items_tenant_id on public.service_items(tenant_id);
create index if not exists idx_quotes_tenant_id on public.quotes(tenant_id);
create index if not exists idx_quote_items_tenant_id on public.quote_items(tenant_id);
create index if not exists idx_service_orders_tenant_id on public.service_orders(tenant_id);
create index if not exists idx_maintenance_reminders_tenant_id on public.maintenance_reminders(tenant_id);
create index if not exists idx_stock_movements_tenant_id on public.stock_movements(tenant_id);
create index if not exists idx_vehicle_mileage_history_tenant_id on public.vehicle_mileage_history(tenant_id);

-- 7) Unicidade de quote_number e order_number POR TENANT (cada oficina pode ter seu "ORC-001")
alter table public.quotes drop constraint if exists quotes_quote_number_key;
create unique index if not exists idx_quotes_tenant_quote_number on public.quotes(tenant_id, quote_number);

alter table public.service_orders drop constraint if exists service_orders_order_number_key;
create unique index if not exists idx_service_orders_tenant_order_number on public.service_orders(tenant_id, order_number);

-- 8) Função auxiliar: tenant do usuário logado (usada nas políticas RLS)
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- 9) RLS: habilitar em todas as tabelas de negócio (apenas se existirem)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenants') then
    alter table public.tenants enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customers') then
    alter table public.customers enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicles') then
    alter table public.vehicles enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'suppliers') then
    alter table public.suppliers enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_items') then
    alter table public.service_items enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quotes') then
    alter table public.quotes enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quote_items') then
    alter table public.quote_items enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'service_orders') then
    alter table public.service_orders enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maintenance_reminders') then
    alter table public.maintenance_reminders enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_movements') then
    alter table public.stock_movements enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vehicle_mileage_history') then
    alter table public.vehicle_mileage_history enable row level security;
  end if;
end $$;

-- 10) Políticas RLS - tenants: usuário só vê o próprio tenant
drop policy if exists "Users see own tenant" on public.tenants;
create policy "Users see own tenant" on public.tenants for select using (id = public.current_tenant_id());

-- 11) Políticas RLS - profiles: manter só o próprio perfil, agora com tenant
drop policy if exists "Self can read own profile" on public.profiles;
drop policy if exists "Self can update own profile" on public.profiles;
create policy "Self can read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Self can update own profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 12) Políticas para as demais tabelas (só vê/insere/atualiza/apaga dados do próprio tenant)
-- customers
drop policy if exists "Tenant isolation" on public.customers;
create policy "Tenant isolation" on public.customers for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- vehicles
drop policy if exists "Tenant isolation" on public.vehicles;
create policy "Tenant isolation" on public.vehicles for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- suppliers
drop policy if exists "Tenant isolation" on public.suppliers;
create policy "Tenant isolation" on public.suppliers for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- service_items
drop policy if exists "Tenant isolation" on public.service_items;
create policy "Tenant isolation" on public.service_items for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- quotes
drop policy if exists "Tenant isolation" on public.quotes;
create policy "Tenant isolation" on public.quotes for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- quote_items (acesso via quote que já é por tenant; por segurança filtramos também por tenant_id)
drop policy if exists "Tenant isolation" on public.quote_items;
create policy "Tenant isolation" on public.quote_items for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- service_orders
drop policy if exists "Tenant isolation" on public.service_orders;
create policy "Tenant isolation" on public.service_orders for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- maintenance_reminders
drop policy if exists "Tenant isolation" on public.maintenance_reminders;
create policy "Tenant isolation" on public.maintenance_reminders for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- stock_movements
drop policy if exists "Tenant isolation" on public.stock_movements;
create policy "Tenant isolation" on public.stock_movements for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- vehicle_mileage_history
drop policy if exists "Tenant isolation" on public.vehicle_mileage_history;
create policy "Tenant isolation" on public.vehicle_mileage_history for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- 13) Trigger: ao criar usuário, usar tenant_id do metadata (quando você criar usuário, envie tenant_id no metadata)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  if v_tenant_id is null then
    v_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
  end if;
  insert into public.profiles (user_id, full_name, role, tenant_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'operator'),
    v_tenant_id
  )
  on conflict (user_id) do update set tenant_id = excluded.tenant_id;
  return new;
end;
$fn$;

-- 14) Permitir que o backend (service_role) insira em tenants e em profiles com qualquer tenant
-- (criação de novos clientes/oficinas e usuários é feita por você com a chave service_role)
drop policy if exists "Service role can manage tenants" on public.tenants;
create policy "Service role can manage tenants" on public.tenants for all using (true) with check (true);

-- Com a chave anon/authenticated, usuários não devem criar tenants. A política acima
-- permite tudo - no Supabase isso só vale para service_role se você usar RLS com
-- bypass para service_role. Na verdade no Supabase a service_role BYPASSA RLS.
-- Então a política "Users see own tenant" é para usuários autenticados (anon key).
-- Para que apenas service_role insira/atualize tenants, não criamos política de
-- INSERT/UPDATE para roles normais. Deixe apenas SELECT para usuário ver seu tenant.
-- A política "Service role can manage tenants" com using(true) daria acesso total
-- a qualquer um... Remover e manter só SELECT para usuário ver o próprio tenant.
-- Inserção em tenants você faz pelo Dashboard ou por função com security definer.

drop policy if exists "Service role can manage tenants" on public.tenants;

-- Inserção em tenants deve ser feita por você (Dashboard SQL ou API com service_role).
-- Usuários autenticados só leem o próprio tenant.

-- Fim da migração multi-tenant.
