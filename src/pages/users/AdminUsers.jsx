import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { apiClient } from '@/api/apiClient.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AdminUsers() {
  const { role, token, tenantName } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [canManageTenants, setCanManageTenants] = useState(false);

  const canManage = role === 'admin';
  const headers = useMemo(() => {
    const bearer = token || import.meta.env.VITE_API_TOKEN || '';
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }, [token]);

  async function loadUsers() {
    setError('');
    setLoading(true);
    try {
      const list = await apiClient.request('GET', '/admin/users', { headers });
      setUsers(list || []);
    } catch (e) {
      setError(e?.message || 'Falha ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  async function loadTenants() {
    setTenantLoading(true);
    try {
      const list = await apiClient.request('GET', '/admin/tenants', { headers });
      setTenants(Array.isArray(list) ? list : []);
      setCanManageTenants(true);
    } catch (e) {
      // Apenas loga; listar tenants requer system admin
      console.warn('[Admin] Falha ao listar tenants:', e?.message || e);
      setCanManageTenants(false);
    } finally {
      setTenantLoading(false);
    }
  }

  useEffect(() => {
    if (canManage) {
      loadUsers();
      loadTenants();
    }
  }, [canManage]);

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const full_name = String(form.get('full_name') || '').trim() || undefined;
    const role = String(form.get('role') || 'operator');
    if (!email || !password) {
      setError('Preencha e-mail e senha (mín. 8 caracteres)');
      return;
    }
    setLoading(true);
    try {
      await apiClient.request('POST', '/admin/users', {
        body: { email, password, full_name, role },
        headers,
      });
      formEl?.reset?.();
      await loadUsers();
    } catch (e) {
      setError(e?.message || 'Falha ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  const onCreateTenant = async (e) => {
    e.preventDefault();
    setError('');
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get('tenant_name') || '').trim();
    const display_name = String(form.get('tenant_display_name') || '').trim() || undefined;
    const logo_url = String(form.get('tenant_logo_url') || '').trim() || undefined;
    if (!name) {
      setError('Informe o nome da oficina');
      return;
    }
    setTenantLoading(true);
    try {
      const created = await apiClient.request('POST', '/admin/tenants', {
        body: { name, display_name, logo_url },
        headers,
      });
      formEl?.reset?.();
      // Tenta atribuir o admin atual ao tenant recém-criado
      await apiClient.request('POST', '/admin/assign-tenant', {
        body: { tenant_id: created?.id },
        headers,
      }).catch(() => {});
      await loadTenants();
    } catch (e) {
      setError(e?.message || 'Falha ao criar oficina (tenant)');
    } finally {
      setTenantLoading(false);
    }
  };

  const onAssignTenant = async (tenantId) => {
    setTenantLoading(true);
    setError('');
    try {
      await apiClient.request('POST', '/admin/assign-tenant', {
        body: { tenant_id: tenantId },
        headers,
      });
      await loadTenants();
    } catch (e) {
      setError(e?.message || 'Falha ao vincular admin ao tenant');
    } finally {
      setTenantLoading(false);
    }
  };

  const onDelete = async (userId) => {
    if (!confirm('Remover usuário? Esta ação é irreversível.')) return;
    setLoading(true);
    setError('');
    try {
      await apiClient.request('DELETE', '/admin/users', {
        body: { user_id: userId },
        headers,
      });
      await loadUsers();
    } catch (e) {
      setError(e?.message || 'Falha ao remover usuário');
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <div className="p-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Funcionários da empresa</CardTitle>
          {tenantName && (
            <p className="text-sm text-gray-500 mt-1">Empresa: {tenantName}</p>
          )}
        </CardHeader>
        <CardContent>
          {canManageTenants && (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">
              {tenantName
                ? 'Você já está vinculado a uma empresa. Se desejar, crie outra oficina e vincule-se a ela.'
                : 'Nenhuma empresa vinculada ao seu usuário. Crie a oficina e vincule seu usuário.'}
            </p>
            <form onSubmit={onCreateTenant} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input name="tenant_name" placeholder="Nome interno (ex: oficina-joao)" required />
              <Input name="tenant_display_name" placeholder="Nome exibido (ex: Oficina do João)" />
              <Input name="tenant_logo_url" placeholder="Logo URL (opcional)" />
              <div className="md:col-span-3">
                <Button type="submit" disabled={tenantLoading}>Criar Oficina</Button>
              </div>
            </form>
            {!!tenants?.length && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">Oficinas existentes (somente para admin do sistema):</p>
                <div className="space-y-2">
                  {tenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between border rounded p-3">
                      <div className="text-sm">
                        <div className="font-medium">{t.display_name || t.name}</div>
                        <div className="text-gray-600">{t.id}</div>
                      </div>
                      <Button variant="outline" onClick={() => onAssignTenant(t.id)} disabled={tenantLoading}>
                        Vincular-me a esta oficina
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          <form onSubmit={onCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <Input name="full_name" placeholder="Nome completo" />
            <Input type="email" name="email" placeholder="E-mail" required />
            <Input type="password" name="password" placeholder="Senha (mín. 8)" required />
            <select name="role" className="border rounded px-3 py-2">
              <option value="operator">operator</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
            <div className="md:col-span-4">
              <Button type="submit" disabled={loading}>Criar Usuário</Button>
            </div>
          </form>

          {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}

          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between border rounded p-3">
                <div className="text-sm">
                  <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                  <div className="text-gray-600">{u.user_id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">{u.role}</span>
                  <Button variant="destructive" onClick={() => onDelete(u.user_id)} disabled={loading}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
