-- Permitir excluir tenant: profiles.tenant_id pode ficar null ao desvincular usuários da empresa excluída
alter table public.profiles alter column tenant_id drop not null;
