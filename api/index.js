import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_SHARED_SECRET = process.env.API_SHARED_SECRET;
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const resourceToTable = {
  'customers': 'customers',
  'vehicles': 'vehicles',
  'suppliers': 'suppliers',
  'service-items': 'service_items',
  'quotes': 'quotes',
  'quote-items': 'quote_items',
  'maintenance-reminders': 'maintenance_reminders',
  'service-orders': 'service_orders',
  'stock-movements': 'stock_movements',
  'vehicle-mileage-history': 'vehicle_mileage_history',
  'tenants': 'tenants',
};

const tenantScopedTables = new Set([
  'customers', 'vehicles', 'suppliers', 'service_items', 'quotes', 'quote_items',
  'service_orders', 'maintenance_reminders', 'stock_movements', 'vehicle_mileage_history',
]);

/** Get profile (userId, tenant_id, role) from JWT. Returns null if invalid or no profile. */
async function getProfileFromToken(bearerToken) {
  if (!bearerToken) return null;
  const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
  if (userErr || !userData?.user?.id) return null;
  const userId = userData.user.id;
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (profErr || !profile?.tenant_id) return null;
  return { userId, tenantId: profile.tenant_id, role: profile.role };
}

/** Resolve tenant for request: JWT -> profile.tenant_id; shared secret -> no tenant (no filter). */
async function getAuthAndTenant(req) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (API_SHARED_SECRET && token === API_SHARED_SECRET) {
      return { authorized: true, tenantId: null };
    }
    if (!token) return { authorized: false, tenantId: null };
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData?.user?.id) return { authorized: false, tenantId: null };
    const profile = await getProfileFromToken(token);
    return {
      authorized: true,
      tenantId: profile?.tenantId ?? null,
      userId: userData.user.id,
      profile,
    };
  } catch (e) {
    console.error('[API] getAuthAndTenant failed:', e?.message || e);
    return { authorized: false, tenantId: null };
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function unauthorized(res) {
  cors(res);
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

function badRequest(res, message) {
  cors(res);
  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message || 'bad_request' }));
}

function notFound(res) {
  cors(res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'not_found' }));
}

function ok(res, data) {
  cors(res);
  res.statusCode = 200;
  if (data === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function authenticateAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (API_SHARED_SECRET && token === API_SHARED_SECRET) return { ok: true, tenantId: null };
  if (!token) return { ok: false, reason: 'missing_token' };
  const profile = await getProfileFromToken(token);
  if (!profile) return { ok: false, reason: 'invalid_token' };
  const { data: userData } = await supabase.auth.getUser(token);
  const email = userData?.user?.email || '';
  const isSystemAdmin = SUPERADMIN_EMAIL && email && email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
  if (profile.role !== 'admin' && !isSystemAdmin) return { ok: false, reason: 'not_admin' };
  return { ok: true, userId: profile.userId, tenantId: profile.tenantId, email, isSystemAdmin };
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

// Convert empty strings to null recursively to avoid DB casting errors (e.g., uuid "")
function normalizePayload(value) {
  if (value === '') return null;
  if (Array.isArray(value)) return value.map((v) => normalizePayload(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizePayload(v);
    return out;
  }
  return value;
}

function getSort(query) {
  const sort = query.get('sort');
  if (!sort) return { column: 'created_date', ascending: false };
  if (sort.startsWith('-')) return { column: sort.slice(1), ascending: false };
  return { column: sort, ascending: true };
}

function getFilters(query) {
  const filters = {};
  for (const [key, value] of query.entries()) {
    if (key === 'sort') continue;
    if (value === undefined || value === null || value === '') continue;
    filters[key] = value;
  }
  return filters;
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.statusCode = 204;
    return res.end();
  }

  const urlObj = new URL(req.url, 'http://localhost');
  let pathname = urlObj.pathname || '';
  // Normalize to remove possible /api/index prefix
  if (pathname.startsWith('/api/index')) pathname = pathname.replace('/api/index', '/api');
  const apiPrefix = '/api/';
  if (!pathname.startsWith(apiPrefix)) {
    return notFound(res);
  }
  const restPath = pathname.slice(apiPrefix.length); // e.g., "customers/123" or "admin/users"
  const [resource, idMaybe] = restPath.split('/');
  const table = resourceToTable[resource];

  // Health check endpoint
  if (resource === 'health') {
    cors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  }

  // Auth for non-admin routes: resolve JWT or shared secret and tenant
  let auth = { authorized: false, tenantId: null };
  if (resource !== 'admin') {
    auth = await getAuthAndTenant(req);
    if (!auth.authorized) return unauthorized(res);
  }
  
  // Admin bootstrap: allow first logged-in user to become admin once
  // POST /api/admin/bootstrap
  if (resource === 'admin' && idMaybe === 'bootstrap') {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) return unauthorized(res);

      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user?.id) return unauthorized(res);
      const userId = userData.user.id;

      const { data: anyAdmin, error: adminErr } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1);
      if (adminErr) return badRequest(res, adminErr.message);
      if (anyAdmin && anyAdmin.length > 0) {
        return ok(res, { promoted: false, reason: 'admin_exists' });
      }

      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', userId)
        .maybeSingle();

      const upsertPayload = { user_id: userId, role: 'admin' };
      if (currentProfile?.tenant_id) upsertPayload.tenant_id = currentProfile.tenant_id;

      const { error: upErr } = await supabase
        .from('profiles')
        .upsert(upsertPayload, { onConflict: 'user_id' });
      if (upErr) return badRequest(res, upErr.message);
      return ok(res, { promoted: true });
    } catch (e) {
      cors(res);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
    }
  }

  // Admin: create and list tenants; assign current admin to a tenant
  // POST /api/admin/tenants           -> create a new tenant (system admin or admin without tenant)
  // GET  /api/admin/tenants            -> list all tenants (system admin only)
  // POST /api/admin/assign-tenant      -> assign current admin profile to a tenant
  if (resource === 'admin' && (idMaybe === 'tenants' || idMaybe === 'assign-tenant')) {
    try {
      const authHeader = req.headers['authorization'] || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const sharedSecretUsed = API_SHARED_SECRET && bearerToken === API_SHARED_SECRET;
      const authz = await authenticateAdmin(req);
      if (!sharedSecretUsed && !authz.ok) return unauthorized(res);
      const adminUserId = sharedSecretUsed ? null : authz.userId;
      const adminTenantId = sharedSecretUsed ? null : (authz.tenantId || null);
      const isSystemAdmin = sharedSecretUsed ? true : !!authz.isSystemAdmin;

      if (idMaybe === 'tenants') {
        if (req.method === 'POST') {
          if (!isSystemAdmin && !sharedSecretUsed) {
            return badRequest(res, 'system_admin_required');
          }
          const raw = await parseBody(req);
          const body = normalizePayload(raw);
          const name = String(body?.name || '').trim();
          const display_name = body?.display_name ? String(body.display_name).trim() : null;
          const logo_url = body?.logo_url ? String(body.logo_url).trim() : null;
          if (!name) return badRequest(res, 'missing_name');

          const { data, error } = await supabase
            .from('tenants')
            .insert({ name, display_name, logo_url })
            .select('*')
            .single();
          if (error) return badRequest(res, error.message);

          return ok(res, data);
        }

        if (req.method === 'PATCH') {
          if (!isSystemAdmin && !sharedSecretUsed) {
            return badRequest(res, 'system_admin_required');
          }
          const raw = await parseBody(req);
          const body = normalizePayload(raw);
          const id = String(body?.id || '').trim();
          if (!id) return badRequest(res, 'missing_id');
          const updates = {};
          if (body.display_name !== undefined) updates.display_name = body.display_name;
          if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
          if (body.status !== undefined) updates.status = body.status;
          const { data, error } = await supabase
            .from('tenants')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();
          if (error) return badRequest(res, error.message);
          return ok(res, data);
        }

        if (req.method === 'GET') {
          if (!sharedSecretUsed && !isSystemAdmin) {
            return badRequest(res, 'system_admin_required');
          }
          const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) return badRequest(res, error.message);
          return ok(res, data || []);
        }

        return notFound(res);
      }

      if (idMaybe === 'assign-tenant') {
        if (req.method !== 'POST') return notFound(res);
        if (!adminUserId) return unauthorized(res);
        if (!isSystemAdmin && !sharedSecretUsed) {
          return badRequest(res, 'system_admin_required');
        }
        const raw = await parseBody(req);
        const body = normalizePayload(raw);
        const targetTenantId = String(body?.tenant_id || '').trim();
        if (!targetTenantId) return badRequest(res, 'missing_tenant_id');

        // Ensure tenant exists
        const { data: tenantExists } = await supabase
          .from('tenants')
          .select('id')
          .eq('id', targetTenantId)
          .maybeSingle();
        if (!tenantExists) return badRequest(res, 'tenant_not_found');

        // Assign current admin to target tenant
        const { error: upErr } = await supabase
          .from('profiles')
          .upsert({ user_id: adminUserId, tenant_id: targetTenantId }, { onConflict: 'user_id' });
        if (upErr) return badRequest(res, upErr.message);
        return ok(res, { assigned: true, tenant_id: targetTenantId });
      }

      return notFound(res);
    } catch (e) {
      cors(res);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
    }
  }

  // Admin endpoints (e.g., POST/GET/DELETE /api/admin/users)
  if (resource === 'admin' && idMaybe === 'users') {
    let adminTenantId = null;
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (API_SHARED_SECRET && bearerToken === API_SHARED_SECRET) {
      // Shared-secret: no tenant filter (list/create all)
    } else {
      const authz = await authenticateAdmin(req);
      if (!authz.ok) return unauthorized(res);
      adminTenantId = authz.tenantId || null;
    }

    if (req.method === 'POST') {
      try {
        const raw = await parseBody(req);
        const body = normalizePayload(raw);
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');
        const fullName = body?.full_name ? String(body.full_name) : undefined;
        const role = String(body?.role || '').toLowerCase();

        if (!email) return badRequest(res, 'missing_email');
        if (!password || password.length < 8) return badRequest(res, 'invalid_password_min_8_chars');
        const allowedRoles = ['admin', 'manager', 'operator'];
        const roleValid = !role || allowedRoles.includes(role);
        if (!roleValid) return badRequest(res, 'invalid_role');

        const userMeta = { full_name: fullName, role: role || 'operator' };
        if (adminTenantId) userMeta.tenant_id = adminTenantId;

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: userMeta,
        });
        if (createErr) return badRequest(res, createErr.message);

        const userId = created?.user?.id;
        if (!userId) return badRequest(res, 'user_creation_failed');

        const profilePayload = {
          user_id: userId,
          full_name: fullName || null,
          role: (roleValid && role) ? role : 'operator',
        };
        if (adminTenantId) profilePayload.tenant_id = adminTenantId;

        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'user_id' });
        if (upsertErr) return badRequest(res, upsertErr.message);

        return ok(res, {
          id: userId,
          email,
          role: profilePayload.role,
        });
      } catch (e) {
        cors(res);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
      }
    }

    if (req.method === 'GET') {
      try {
        const tenantFilter = (new URL(req.url, 'http://localhost')).searchParams.get('tenant_id');
        let q = supabase.from('profiles').select('user_id, full_name, role, tenant_id');
        if (tenantFilter === 'none') {
          q = q.is('tenant_id', null);
        } else if (tenantFilter) {
          q = q.eq('tenant_id', tenantFilter);
        } else if (adminTenantId) {
          q = q.eq('tenant_id', adminTenantId);
        }
        const { data, error } = await q;
        if (error) return badRequest(res, error.message);
        return ok(res, (data || []).map(({ tenant_id, ...rest }) => rest));
      } catch (e) {
        cors(res);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
      }
    }

    if (req.method === 'DELETE') {
      try {
        const raw = await parseBody(req);
        const userId = String(raw?.user_id || '').trim();
        if (!userId) return badRequest(res, 'missing_user_id');

        if (adminTenantId) {
          const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('user_id', userId).maybeSingle();
          if (prof && prof.tenant_id !== adminTenantId) return unauthorized(res);
        }

        const { error: delAuthErr } = await supabase.auth.admin.deleteUser(userId);
        if (delAuthErr) return badRequest(res, delAuthErr.message);

        const { error: delProfErr } = await supabase.from('profiles').delete().eq('user_id', userId);
        if (delProfErr) return badRequest(res, delProfErr.message);

        return ok(res, { deleted: true });
      } catch (e) {
        cors(res);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
      }
    }

    return notFound(res);
  }

  // Superadmin: assign any user to a tenant
  if (resource === 'admin' && idMaybe === 'assign-user') {
    try {
      const authHeader = req.headers['authorization'] || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const sharedSecretUsed = API_SHARED_SECRET && bearerToken === API_SHARED_SECRET;
      const authz = await authenticateAdmin(req);
      if (!sharedSecretUsed && !authz.ok) return unauthorized(res);
      const isSystemAdmin = sharedSecretUsed ? true : !!authz.isSystemAdmin;
      if (!isSystemAdmin && !sharedSecretUsed) {
        return badRequest(res, 'system_admin_required');
      }
      if (req.method !== 'POST') return notFound(res);
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const userId = String(body?.user_id || '').trim();
      const targetTenantId = String(body?.tenant_id || '').trim();
      if (!userId || !targetTenantId) return badRequest(res, 'missing_user_or_tenant');
      const { data: tenantExists } = await supabase
        .from('tenants')
        .select('id')
        .eq('id', targetTenantId)
        .maybeSingle();
      if (!tenantExists) return badRequest(res, 'tenant_not_found');
      const { error: upErr } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, tenant_id: targetTenantId }, { onConflict: 'user_id' });
      if (upErr) return badRequest(res, upErr.message);
      return ok(res, { assigned: true, user_id: userId, tenant_id: targetTenantId });
    } catch (e) {
      cors(res);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
    }
  }

  if (!table) return notFound(res);

  const isTenantScoped = tenantScopedTables.has(table);
  const tenantId = auth.tenantId || null;
  // Para tabelas multi-tenant (com tenant_id) E para a própria tabela tenants,
  // exigimos que o usuário tenha um tenantId válido.
  if ((isTenantScoped || table === 'tenants') && !tenantId) {
    return badRequest(res, 'tenant_required');
  }

  try {
    if (req.method === 'GET') {
      if (idMaybe) {
        let q = supabase.from(table).select('*').eq('id', idMaybe).limit(1);
        if (isTenantScoped && tenantId) q = q.eq('tenant_id', tenantId);
        if (table === 'tenants' && tenantId) q = q.eq('id', tenantId);
        const { data, error } = await q;
        if (error) return badRequest(res, error.message);
        return ok(res, data || []);
      }
      const { column, ascending } = getSort(urlObj.searchParams);
      let sortColumn = column;
      if (table === 'tenants' && sortColumn === 'created_date') {
        // tenants usa created_at em vez de created_date
        sortColumn = 'created_at';
      }
      let query = supabase.from(table).select('*').order(sortColumn, { ascending });
      if (isTenantScoped && tenantId) query = query.eq('tenant_id', tenantId);
      if (table === 'tenants' && tenantId) query = query.eq('id', tenantId);
      const filters = getFilters(urlObj.searchParams);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query;
      if (error) return badRequest(res, error.message);
      return ok(res, data || []);
    }

    if (req.method === 'POST') {
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      if (isTenantScoped && tenantId) {
        body.tenant_id = tenantId;
      }
      const { data, error } = await supabase.from(table).insert(body).select('*').single();
      if (error) return badRequest(res, error.message);
      return ok(res, data);
    }

    if (req.method === 'PUT') {
      if (!idMaybe) return badRequest(res, 'missing_id');
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      if (isTenantScoped && tenantId) {
        delete body.tenant_id;
      }
      let q = supabase.from(table).update(body).eq('id', idMaybe);
      if (isTenantScoped && tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.select('*').single();
      if (error) return badRequest(res, error.message);
      return ok(res, data);
    }

    if (req.method === 'DELETE') {
      if (!idMaybe) return badRequest(res, 'missing_id');
      let q = supabase.from(table).delete().eq('id', idMaybe);
      if (isTenantScoped && tenantId) q = q.eq('tenant_id', tenantId);
      const { error } = await q;
      if (error) return badRequest(res, error.message);
      return ok(res, {});
    }

    return notFound(res);
  } catch (e) {
    cors(res);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
  }
}
