-- Supabase schema for Oficina app
-- Run this in Supabase SQL editor (project > SQL)

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Auth Profiles and Roles
do $$ begin
  create type public.user_role as enum ('admin', 'manager', 'operator');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  full_name text,
  role public.user_role not null default 'operator',
  created_at timestamptz not null default now()
);

-- Ensure Row Level Security policies for profiles
alter table public.profiles enable row level security;

do $$ begin
  create policy "Self can read own profile" on public.profiles
    for select
    using ( auth.uid() = user_id );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "Self can update own profile" on public.profiles
    for update
    using ( auth.uid() = user_id )
    with check ( auth.uid() = user_id );
exception
  when duplicate_object then null;
end $$;

-- Optional: admins can read all profiles if your service uses service role key
-- (Handled server-side via service role; no RLS policy needed here)

-- Customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  address text,
  cpf_cnpj text,
  notes text,
  created_date timestamptz not null default now()
);
create index if not exists idx_customers_created_date on public.customers(created_date desc);

-- Vehicles
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  license_plate text not null,
  brand text not null,
  model text not null,
  year integer,
  color text,
  current_mileage integer default 0,
  notes text,
  created_date timestamptz not null default now()
);
create index if not exists idx_vehicles_customer_id on public.vehicles(customer_id);
create index if not exists idx_vehicles_created_date on public.vehicles(created_date desc);
create index if not exists idx_vehicles_license_plate on public.vehicles(license_plate);

-- Suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  cnpj text,
  purchase_frequency_days integer default 30,
  notes text,
  created_date timestamptz not null default now()
);
create index if not exists idx_suppliers_created_date on public.suppliers(created_date desc);

-- Service Items (catalog)
create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('servico','peca','produto')),
  sale_price numeric not null default 0,
  cost_price numeric not null default 0,
  supplier_id uuid references public.suppliers(id) on delete set null,
  current_stock integer default 0,
  minimum_stock integer default 0,
  labor_cost numeric default 0,
  template_reminder_message text,
  description text,
  is_active boolean not null default true,
  default_warranty_days integer default 0,
  replacement_period_days integer default 0,
  replacement_mileage integer default 0,
  combo_items jsonb,
  created_date timestamptz not null default now()
);
create index if not exists idx_service_items_supplier_id on public.service_items(supplier_id);
create index if not exists idx_service_items_created_date on public.service_items(created_date desc);

-- Quotes
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  quote_number text not null unique,
  status text not null check (status in ('em_analise','aprovada','recusada','concluida')),
  service_date date not null,
  vehicle_mileage integer default 0,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  discount_percent numeric default 0,
  discount_amount numeric default 0,
  amount_paid numeric default 0,
  amount_pending numeric default 0,
  payment_status text default 'pendente' check (payment_status in ('pendente','parcialmente_pago','pago')),
  approved_date timestamptz,
  completion_date timestamptz,
  service_duration_hours numeric,
  notes text,
  created_date timestamptz not null default now()
);
create index if not exists idx_quotes_created_date on public.quotes(created_date desc);
create index if not exists idx_quotes_customer_id on public.quotes(customer_id);
create index if not exists idx_quotes_vehicle_id on public.quotes(vehicle_id);

-- Quote Items
create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_item_id uuid references public.service_items(id) on delete set null,
  service_item_name text not null,
  service_item_type text not null check (service_item_type in ('servico','peca','produto')),
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  cost_price numeric not null default 0,
  total numeric not null default 0,
  warranty_days integer default 0,
  warranty_expiry_date date,
  replacement_period_days integer default 0,
  replacement_mileage integer default 0,
  next_service_date date,
  next_service_mileage integer,
  created_date timestamptz not null default now()
);
create index if not exists idx_quote_items_quote_id on public.quote_items(quote_id);
create index if not exists idx_quote_items_created_date on public.quote_items(created_date desc);

-- Service Orders
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  order_number text not null unique,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.vehicles(id),
  vehicle_mileage integer,
  status text not null default 'aguardando' check (status in ('aguardando','em_andamento','finalizada')),
  start_date timestamptz,
  end_date timestamptz,
  duration_hours numeric,
  created_date timestamptz not null default now()
);
create index if not exists idx_service_orders_created_date on public.service_orders(created_date desc);
create index if not exists idx_service_orders_quote_id on public.service_orders(quote_id);

-- Maintenance Reminders
create table if not exists public.maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  quote_item_id uuid references public.quote_items(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  service_name text not null,
  reminder_type text not null check (reminder_type in ('tempo','quilometragem','ambos')),
  target_date date,
  target_mileage integer,
  status text not null default 'pendente' check (status in ('pendente','notificado','realizado','ignorado')),
  notification_sent_date date,
  whatsapp_message text,
  customer_phone text,
  created_date timestamptz not null default now()
);
create index if not exists idx_reminders_status on public.maintenance_reminders(status);
create index if not exists idx_reminders_target_date on public.maintenance_reminders(target_date);
create index if not exists idx_reminders_vehicle_id on public.maintenance_reminders(vehicle_id);
create index if not exists idx_reminders_created_date on public.maintenance_reminders(created_date desc);

-- Stock Movements
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  service_item_id uuid not null references public.service_items(id) on delete cascade,
  type text not null check (type in ('entrada','saida')),
  quantity integer not null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  movement_date date not null,
  notes text,
  created_date timestamptz not null default now()
);
create index if not exists idx_stock_movements_item_id on public.stock_movements(service_item_id);
create index if not exists idx_stock_movements_created_date on public.stock_movements(created_date desc);

-- Vehicle Mileage History
create table if not exists public.vehicle_mileage_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  mileage integer not null,
  record_date date not null,
  quote_id uuid references public.quotes(id) on delete set null,
  notes text,
  created_date timestamptz not null default now()
);
create index if not exists idx_mileage_history_vehicle_id on public.vehicle_mileage_history(vehicle_id);
create index if not exists idx_mileage_history_created_date on public.vehicle_mileage_history(created_date desc);

-- Auth: auto-create profile on new user
-- This function will create a profile row when a new auth user is created.
do $$ begin
  create or replace function public.handle_new_auth_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    -- Insert a profile using optional metadata defaults
    insert into public.profiles (user_id, full_name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', null),
      coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'operator')
    )
    on conflict (user_id) do nothing;
    return new;
  end;
  $fn$;
exception
  when others then null;
end $$;

-- Recreate trigger idempotently to avoid duplicate-object errors
do $$ begin
  drop trigger if exists on_auth_user_created on auth.users;
exception
  when undefined_object then null;
end $$;

do $$ begin
  create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
exception
  when duplicate_object then null;
end $$;
