import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { apiClient } from '@/api/apiClient.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SuperAdmin() {
  const { user, role, token } = useAuth();
  const superEmail = import.meta.env.VITE_SUPERADMIN_EMAIL;
  const isSuperAdmin = superEmail && user?.email && user.email.toLowerCase() === String(superEmail).toLowerCase();
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantUsers, setTenantUsers] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const headers = useMemo(() => {
    const bearer = token || import.meta.env.VITE_API_TOKEN || '';
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }, [token]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadTenants();
  }, [isSuperAdmin]);

  async function loadTenants() {
    setLoading(true);
    setError('');
    try {
      const list = await apiClient.request('GET', '/admin/tenants', { headers });
      setTenants(Array.isArray(list) ? list : []);
      if (list?.[0]?.id) {
        await selectTenant(list[0].id);
      }
    } catch (e) {
      setError(e?.message || 'Falha ao carregar oficinas');
    } finally {
      setLoading(false);
    }
  }

  async function selectTenant(tenantId) {
    setSelectedTenantId(tenantId);
    setLoading(true);
    setError('');
    try {
      const users = await apiClient.request('GET', `/admin/users?tenant_id=${tenantId}`, { headers });
      setTenantUsers(Array.isArray(users) ? users : []);
      const unassigned = await apiClient.request('GET', `/admin/users?tenant_id=none`, { headers });
      setUnassignedUsers(Array.isArray(unassigned) ? unassigned : []);
    } catch (e) {
      setError(e?.message || 'Falha ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  async function onCreateTenant(e) {
    e.preventDefault();
    setError('');
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get('tenant_name') || '').trim();
    const display_name = String(form.get('tenant_display_name') || '').trim() || undefined;
    const logo_url = String(form.get('tenant_logo_url') || '').trim() || undefined;
    if (!name) {
      setError('Informe o nome interno da oficina');
      return;
    }
    setLoading(true);
    try {
      await apiClient.request('POST', '/admin/tenants', {
        body: { name, display_name, logo_url },
        headers,
      });
      formEl?.reset?.();
      await loadTenants();
    } catch (e) {
      setError(e?.message || 'Falha ao criar oficina');
    } finally {
      setLoading(false);
    }
  }

  async function onToggleTenantStatus(id, currentStatus) {
    setLoading(true);
    setError('');
    try {
      const next = currentStatus === 'paused' ? 'active' : 'paused';
      await apiClient.request('PATCH', '/admin/tenants', {
        body: { id, status: next },
        headers,
      });
      await loadTenants();
    } catch (e) {
      setError(e?.message || 'Falha ao atualizar status da oficina');
    } finally {
      setLoading(false);
    }
  }

  async function onAssignUser(userId, tenantId) {
    setLoading(true);
    setError('');
    try {
      await apiClient.request('POST', '/admin/assign-user', {
        body: { user_id: userId, tenant_id: tenantId },
        headers,
      });
      await selectTenant(tenantId);
    } catch (e) {
      setError(e?.message || 'Falha ao vincular usuário à oficina');
    } finally {
      setLoading(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <h2 className="text-2xl font-bold">Acesso restrito</h2>
          <p className="text-gray-600">Esta página é exclusiva do Administrador Geral.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Painel do Administrador Geral</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}

          <form onSubmit={onCreateTenant} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Input name="tenant_name" placeholder="Nome interno (ex: oficina-joao)" required />
            <Input name="tenant_display_name" placeholder="Nome exibido (ex: Oficina do João)" />
            <Input name="tenant_logo_url" placeholder="Logo URL (opcional)" />
            <div className="md:col-span-3">
              <Button type="submit" disabled={loading}>Criar Oficina</Button>
            </div>
          </form>

          <div className="space-y-2 mb-6">
            {tenants.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between border rounded p-3 cursor-pointer ${selectedTenantId === t.id ? 'bg-blue-50' : ''}`}
                onClick={() => selectTenant(t.id)}
              >
                <div className="text-sm">
                  <div className="font-medium">{t.display_name || t.name}</div>
                  <div className="text-gray-600">{t.id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">{t.status || 'active'}</span>
                  <Button variant="outline" onClick={() => onToggleTenantStatus(t.id, t.status || 'active')} disabled={loading}>
                    {t.status === 'paused' ? 'Ativar' : 'Pausar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {selectedTenantId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Usuários desta oficina</h3>
                <div className="space-y-2">
                  {tenantUsers.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between border rounded p-3">
                      <div className="text-sm">
                        <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                        <div className="text-gray-600">{u.user_id}</div>
                      </div>
                    </div>
                  ))}
                  {!tenantUsers.length && (
                    <div className="text-sm text-gray-500">Nenhum usuário vinculado a esta oficina</div>
                  )}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Usuários disponíveis para vincular</h3>
                <div className="space-y-2">
                  {unassignedUsers.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between border rounded p-3">
                      <div className="text-sm">
                        <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                        <div className="text-gray-600">{u.user_id}</div>
                      </div>
                      <Button variant="outline" onClick={() => onAssignUser(u.user_id, selectedTenantId)} disabled={loading}>
                        Vincular
                      </Button>
                    </div>
                  ))}
                  {!unassignedUsers.length && (
                    <div className="text-sm text-gray-500">Nenhum usuário disponível sem oficina</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
