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
  if (profErr || !profile) return null;
  return { userId, tenantId: profile?.tenant_id ?? null, role: profile.role };
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
  if (resource === 'ai' && idMaybe === 'chat') {
    try {
      const authz = await getAuthAndTenant(req);
      if (!authz.authorized) return unauthorized(res);
      const tenantId = authz.tenantId || null;
      if (!tenantId) return badRequest(res, 'tenant_required');
      if (req.method !== 'POST') return notFound(res);
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const context = body?.context || {};
      if (!messages.length) return badRequest(res, 'missing_messages');
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      let plan = null;
      if (apiKey) {
        const sys = [
          'Você é um agente para oficinas mecânicas.',
          'Receba mensagens do usuário e produza um JSON com campos:',
          '{ "assistant_message": string, "requested_fields": [{ key, label, type }], "actions": [{ "type": string, "params": object }] }',
          'Tipos de ação: "create_customer", "create_vehicle", "add_supplier", "add_service_item", "search_plate", "diagnose_quote", "update_vehicle_mileage".',
          'Só peça requested_fields quando faltarem dados.',
          'Quando possível, infira do texto: nome do cliente, placa, marca, modelo, ano, km.',
          'Para diagnose_quote, inclua "problem_description" e um identificador do veículo (vehicle_id ou license_plate).',
          'Quando o usuário descreve um problema sem placa, execute "diagnose" primeiro para dar diagnóstico preliminar; depois ofereça criar cotação e vincular a cliente/veículo.',
          'Exemplos de saída:',
          '{"assistant_message":"Vamos cadastrar seu cliente.","requested_fields":[{"key":"name","label":"Nome do cliente","type":"text"},{"key":"phone","label":"Telefone","type":"text"}],"actions":[{"type":"create_customer","params":{}}]}',
          '{"assistant_message":"Vou consultar a placa.","requested_fields":[],"actions":[{"type":"search_plate","params":{"license_plate":"DZZ-1A16"}}]}',
          '{"assistant_message":"Gerando diagnóstico e cotação.","requested_fields":[],"actions":[{"type":"diagnose_quote","params":{"license_plate":"ABC-1D23","problem_description":"Carro engasgando na partida"}}]}'
        ].join('\n');
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: sys }, ...messages],
            temperature: 0.2,
            response_format: { type: 'json_object' }
          })
        });
        const json = await resp.json();
        const content = json?.choices?.[0]?.message?.content || '';
        try {
          plan = JSON.parse(content);
        } catch {
          plan = null;
        }
      }
      if (!plan) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
        const text = String(lastUser).toLowerCase();
        const performed = [];
        const requested_fields = [];
        const actions = [];
        const plateMatch = lastUser.match(/[A-Z]{3}-?[0-9][A-Z][0-9]{2}|[A-Z]{3}-[0-9]{4}|[A-Z]{3}[0-9]{4}/i);
        const plate = plateMatch ? plateMatch[0].toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})([0-9][A-Z][0-9]{2}|[0-9]{4})$/, (m, a, b) => `${a}-${b}`) : null;
        const hasCadastrar = /cadastr/i.test(text);
        const hasCliente = /cliente/i.test(text);
        const hasVeiculo = /ve[ií]culo|carro/i.test(text);
        const hasFornecedor = /fornecedor/i.test(text);
        const hasProduto = /produto|pe[cç]a|servi[cç]o/i.test(text);
        const wantsConsultaPlaca = /consultar.*placa|placa\s*[A-Z]/i.test(lastUser);
        const problem = /engasga|engasg|barulho|n[aã]o liga|falhando|vazando|trepida|desalinhado|puxando|perda de pot[eê]ncia|luz de alerta|aquecendo|fum[aá]ndo|vibra/i.test(text);
        const phoneMatch = lastUser.match(/(\+?\d{2,3}\s?)?(\d{2})\s?\d{4,5}-?\d{4}/) || lastUser.match(/\b\d{10,13}\b/);
        const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : null;
        let name = null;
        const nameAfterCliente = lastUser.match(/cliente\s+([A-Za-zÀ-ÖØ-öø-ÿ'\s]+)/i);
        if (nameAfterCliente) name = nameAfterCliente[1].trim();
        if (hasCadastrar && hasCliente) {
          if (name) {
            actions.push({ type: 'create_customer', params: { name, phone } });
          } else {
            actions.push({ type: 'create_customer', params: {} });
            requested_fields.push({ key: 'name', label: 'Nome do cliente', type: 'text' });
            requested_fields.push({ key: 'phone', label: 'Telefone (opcional)', type: 'text' });
          }
        } else if (hasCadastrar && hasVeiculo) {
          actions.push({ type: 'create_vehicle', params: {} });
          requested_fields.push({ key: 'license_plate', label: 'Placa do veículo', type: 'text' });
          requested_fields.push({ key: 'brand', label: 'Marca', type: 'text' });
          requested_fields.push({ key: 'model', label: 'Modelo', type: 'text' });
          requested_fields.push({ key: 'year', label: 'Ano', type: 'number' });
          requested_fields.push({ key: 'current_mileage', label: 'KM atual', type: 'number' });
        } else if (hasFornecedor) {
          actions.push({ type: 'add_supplier', params: {} });
          requested_fields.push({ key: 'name', label: 'Nome do fornecedor', type: 'text' });
          requested_fields.push({ key: 'phone', label: 'Telefone (opcional)', type: 'text' });
          requested_fields.push({ key: 'email', label: 'Email (opcional)', type: 'text' });
        } else if (hasProduto) {
          actions.push({ type: 'add_service_item', params: {} });
          requested_fields.push({ key: 'name', label: 'Nome do item', type: 'text' });
          requested_fields.push({ key: 'type', label: 'Tipo (servico|peca|produto)', type: 'text' });
          requested_fields.push({ key: 'sale_price', label: 'Preço de venda', type: 'number' });
          requested_fields.push({ key: 'cost_price', label: 'Preço de custo', type: 'number' });
        } else if (wantsConsultaPlaca || plate) {
          actions.push({ type: 'search_plate', params: { license_plate: plate || '' } });
          if (!plate) requested_fields.push({ key: 'license_plate', label: 'Placa do veículo', type: 'text' });
        } else if (problem) {
          actions.push({ type: 'diagnose', params: { problem_description: lastUser } });
          if (plate) actions.push({ type: 'diagnose_quote', params: { license_plate: plate, problem_description: lastUser } });
          // sem placa, primeiro diagnóstico; depois ofereça criar cotação
        }
        plan = { assistant_message: 'Ok, preciso de alguns dados para continuar.', requested_fields, actions };
      }
      const actions = Array.isArray(plan.actions) ? plan.actions : [];
      const performed = [];
      const idMap = {};
      const provided = context?.provided_fields || {};
      const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
      for (const action of actions) {
        const type = String(action?.type || '');
        const p = { ...(action?.params || {}) };
        if (type === 'diagnose') {
          const problemDescription = String(p?.problem_description || provided?.problem_description || lastUser || '').trim();
          const apiKeyDiag = process.env.OPENAI_API_KEY;
          const modelDiag = process.env.OPENAI_MODEL || 'gpt-4o-mini';
          let diag = null;
          if (apiKeyDiag) {
            const prompt = [
              'Você é um mecânico experiente. Receba um relato de problema e gere um diagnóstico preliminar em JSON:',
              'Campos: diagnosis_summary, probable_causes[], recommended_services[].',
              `Problema relatado: ${problemDescription}`
            ].join('\n');
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKeyDiag}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelDiag,
                messages: [{ role: 'system', content: 'Assistente de oficina mecânica.' }, { role: 'user', content: prompt }],
                temperature: 0.2,
                response_format: { type: 'json_object' }
              })
            });
            const json = await resp.json();
            const content = json?.choices?.[0]?.message?.content || '';
            try { diag = JSON.parse(content); } catch { diag = null; }
          }
          performed.push({
            type,
            diagnosis_summary: diag?.diagnosis_summary || null,
            probable_causes: diag?.probable_causes || [],
            recommended_services: diag?.recommended_services || []
          });
          continue;
        }
        if (type === 'create_customer') {
          const name = String(p?.name || provided?.name || '').trim();
          const phone = String(p?.phone || provided?.phone || '').trim() || null;
          if (!name) continue;
          const { data, error } = await supabase.from('customers').insert({ name, phone, tenant_id: tenantId }).select('*').single();
          if (error) continue;
          performed.push({ type, id: data.id, name: data.name });
          idMap.customer_id = data.id;
        } else if (type === 'create_vehicle') {
          const brand = String(p?.brand || provided?.brand || '').trim();
          const modelName = String(p?.model || provided?.model || '').trim();
          const licensePlate = String(p?.license_plate || provided?.license_plate || '').trim();
          const year = p?.year ? Number(p.year) : (provided?.year ? Number(provided.year) : null);
          const currentMileage = p?.current_mileage ? Number(p.current_mileage) : (provided?.current_mileage ? Number(provided.current_mileage) : 0);
          let customerId = p?.customer_id || idMap.customer_id || context?.customer_id || null;
          if (!brand || !modelName || !licensePlate) continue;
          const { data, error } = await supabase
            .from('vehicles')
            .insert({ brand, model: modelName, year, license_plate: licensePlate, current_mileage: currentMileage, customer_id: customerId, tenant_id: tenantId })
            .select('*')
            .single();
          if (error) continue;
          performed.push({ type, id: data.id, license_plate: data.license_plate });
          idMap.vehicle_id = data.id;
        } else if (type === 'add_supplier') {
          const name = String(p?.name || provided?.name || '').trim();
          if (!name) continue;
          const phone = String(p?.phone || provided?.phone || '').trim() || null;
          const email = String(p?.email || provided?.email || '').trim() || null;
          const { data, error } = await supabase.from('suppliers').insert({ name, phone, email, tenant_id: tenantId }).select('*').single();
          if (error) continue;
          performed.push({ type, id: data.id, name: data.name });
        } else if (type === 'add_service_item') {
          const name = String(p?.name || provided?.name || '').trim();
          const itemType = String(p?.type || provided?.type || '').trim() || 'servico';
          if (!name) continue;
          const salePrice = Number(p?.sale_price ?? provided?.sale_price ?? 0);
          const costPrice = Number(p?.cost_price ?? provided?.cost_price ?? 0);
          const warrantyDays = Number(p?.default_warranty_days ?? provided?.default_warranty_days ?? 0);
          const replDays = Number(p?.replacement_period_days ?? provided?.replacement_period_days ?? 0);
          const replKm = Number(p?.replacement_mileage ?? provided?.replacement_mileage ?? 0);
          const { data, error } = await supabase
            .from('service_items')
            .insert({
              name,
              type: itemType,
              sale_price: salePrice,
              cost_price: costPrice,
              default_warranty_days: warrantyDays,
              replacement_period_days: replDays,
              replacement_mileage: replKm,
              tenant_id: tenantId
            })
            .select('*')
            .single();
          if (error) continue;
          performed.push({ type, id: data.id, name: data.name });
        } else if (type === 'search_plate') {
          const licensePlate = String(p?.license_plate || provided?.license_plate || '').trim();
          if (!licensePlate) continue;
          const { data: vehicle } = await supabase.from('vehicles').select('*').eq('license_plate', licensePlate).eq('tenant_id', tenantId).maybeSingle();
          if (vehicle) {
            const { data: quotesForVehicle } = await supabase.from('quotes').select('id,quote_number,status,vehicle_mileage').eq('vehicle_id', vehicle.id).eq('tenant_id', tenantId);
            performed.push({ type, vehicle, quotes: quotesForVehicle || [] });
            idMap.vehicle_id = vehicle.id;
            idMap.customer_id = vehicle.customer_id;
          } else {
            performed.push({ type, vehicle: null });
          }
        } else if (type === 'update_vehicle_mileage') {
          const vehicleId = p?.vehicle_id || idMap.vehicle_id || null;
          const mileage = Number(p?.mileage ?? provided?.mileage ?? 0);
          if (!vehicleId || !mileage) continue;
          await supabase.from('vehicle_mileage_history').insert({ vehicle_id: vehicleId, mileage, tenant_id: tenantId });
          await supabase.from('vehicles').update({ current_mileage: mileage }).eq('id', vehicleId).eq('tenant_id', tenantId);
          performed.push({ type, vehicle_id: vehicleId, mileage });
        } else if (type === 'diagnose_quote') {
          let vehicleId = p?.vehicle_id || idMap.vehicle_id || null;
          let customerId = p?.customer_id || idMap.customer_id || context?.customer_id || null;
          const licensePlate = String(p?.license_plate || provided?.license_plate || '').trim();
          const problemDescription = String(p?.problem_description || provided?.problem_description || lastUser || '').trim();
          if (!vehicleId && licensePlate) {
            const { data: vehicleFound } = await supabase.from('vehicles').select('id,customer_id').eq('license_plate', licensePlate).eq('tenant_id', tenantId).maybeSingle();
            if (vehicleFound) {
              vehicleId = vehicleFound.id;
              customerId = customerId || vehicleFound.customer_id;
            }
          }
          if (!customerId || !vehicleId || !problemDescription) {
            performed.push({ type, error: 'missing_fields', missing: { customer_id: !customerId, vehicle_id: !vehicleId, problem_description: !problemDescription } });
            continue;
          }
          const { data: customer } = await supabase.from('customers').select('id,name,phone').eq('id', customerId).eq('tenant_id', tenantId).maybeSingle();
          const { data: vehicle } = await supabase.from('vehicles').select('id,brand,model,year,license_plate,current_mileage').eq('id', vehicleId).eq('tenant_id', tenantId).maybeSingle();
          if (!customer || !vehicle) {
            performed.push({ type, error: 'customer_or_vehicle_not_found' });
            continue;
          }
          const { data: catalog } = await supabase.from('service_items').select('id,name,type,sale_price,cost_price,default_warranty_days,replacement_period_days,replacement_mileage').eq('tenant_id', tenantId);
          const { data: pastItems } = await supabase
            .from('quote_items')
            .select('service_item_name,service_item_type,quantity,unit_price,cost_price,created_date,quote_id')
            .eq('tenant_id', tenantId)
            .in('quote_id', (await supabase.from('quotes').select('id').eq('vehicle_id', vehicleId).eq('tenant_id', tenantId)).data?.map(q => q.id) || []);
          let aiResult = null;
          if (apiKey) {
            const prompt = [
              'Oficina mecânica. Gere diagnóstico e plano em JSON.',
              `Cliente: ${customer.name}`,
              `Veículo: ${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} Placa ${vehicle.license_plate}`,
              `KM: ${vehicle.current_mileage || 0}`,
              `Problema relatado: ${problemDescription}`,
              `Histórico: ${(pastItems || []).slice(0, 30).map(i => `${i.service_item_name}`).join('; ') || 'sem histórico'}`,
              'Campos: diagnosis_summary, probable_causes[], labor_hours, recommended_services[].'
            ].join('\n');
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: 'Você é um assistente de oficina mecânica.' }, { role: 'user', content: prompt }],
                temperature: 0.2
              })
            });
            const json = await resp.json();
            const content = json?.choices?.[0]?.message?.content || '';
            try {
              aiResult = JSON.parse(content);
            } catch {
              aiResult = null;
            }
          }
          const recs = Array.isArray(aiResult?.recommended_services) ? aiResult.recommended_services : [];
          const mappedItems = recs.map(r => {
            const nameNorm = String(r.name || '').toLowerCase();
            const found = (catalog || []).find(s => {
              const sn = (s.name || '').toLowerCase();
              return sn.includes(nameNorm) || nameNorm.includes(sn);
            });
            const type = r.type === 'peca' || r.type === 'produto' ? r.type : (r.type === 'servico' ? 'servico' : (found?.type || 'servico'));
            const quantity = Number(r.quantity || 1);
            const unitPrice = found ? Number(found.sale_price || 0) : Number(r.estimated_unit_price || 0);
            const costPrice = found ? Number(found.cost_price || 0) : Number(r.estimated_cost_price || 0);
            const warrantyDays = Number(r.warranty_days || found?.default_warranty_days || 0);
            const replDays = Number(r.replacement_period_days || found?.replacement_period_days || 0);
            const replKm = Number(r.replacement_mileage || found?.replacement_mileage || 0);
            return {
              service_item_id: found?.id || null,
              service_item_name: found?.name || r.name || 'Item',
              service_item_type: type,
              quantity,
              unit_price: unitPrice,
              cost_price: costPrice,
              total: unitPrice * quantity,
              warranty_days: warrantyDays,
              replacement_period_days: replDays,
              replacement_mileage: replKm
            };
          });
          const subtotal = mappedItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
          const discountPercent = 0;
          const discountAmount = 0;
          const total = subtotal - discountAmount;
          const { data: quotesCountData } = await supabase.from('quotes').select('id').eq('tenant_id', tenantId);
          const nextNumber = (quotesCountData || []).length + 1;
          const quoteNumber = `COT-${String(nextNumber).padStart(6, '0')}`;
          const { data: createdQuote, error: qErr } = await supabase
            .from('quotes')
            .insert({
              customer_id: customerId,
              vehicle_id: vehicleId,
              quote_number: quoteNumber,
              status: 'em_analise',
              service_date: new Date().toISOString().split('T')[0],
              vehicle_mileage: vehicle.current_mileage || 0,
              subtotal,
              total,
              discount_percent: discountPercent,
              discount_amount: discountAmount,
              amount_paid: 0,
              amount_pending: total,
              payment_status: 'pendente',
              service_duration_hours: Number(aiResult?.labor_hours || 0),
              notes: aiResult?.diagnosis_summary || problemDescription,
              tenant_id: tenantId
            })
            .select('*')
            .single();
          if (qErr) {
            performed.push({ type, error: qErr.message });
            continue;
          }
          for (const item of mappedItems) {
            await supabase
              .from('quote_items')
              .insert({
                quote_id: createdQuote.id,
                service_item_id: item.service_item_id,
                service_item_name: item.service_item_name,
                service_item_type: item.service_item_type,
                quantity: item.quantity,
                unit_price: item.unit_price,
                cost_price: item.cost_price,
                total: item.total,
                warranty_days: item.warranty_days,
                tenant_id: tenantId
              });
            const nextServiceDate = item.replacement_period_days > 0 ? new Date(Date.now() + item.replacement_period_days * 24 * 3600 * 1000).toISOString().split('T')[0] : null;
            const nextServiceMileage = item.replacement_mileage > 0 ? (vehicle.current_mileage || 0) + item.replacement_mileage : null;
            if (nextServiceDate || nextServiceMileage) {
              const message = `Lembrete: ${item.service_item_name} para ${customer.name} (${vehicle.brand} ${vehicle.model} ${vehicle.license_plate}).`;
              await supabase
                .from('maintenance_reminders')
                .insert({
                  customer_id: customerId,
                  vehicle_id: vehicleId,
                  quote_id: createdQuote.id,
                  service_name: item.service_item_name,
                  reminder_type: nextServiceDate && nextServiceMileage ? 'ambos' : (nextServiceDate ? 'tempo' : 'quilometragem'),
                  target_date: nextServiceDate,
                  target_mileage: nextServiceMileage,
                  status: 'pendente',
                  whatsapp_message: message,
                  customer_phone: customer.phone || null,
                  tenant_id: tenantId
                });
            }
          }
          performed.push({ type, quote_id: createdQuote.id, quote_number: createdQuote.quote_number, subtotal, total, diagnosis_summary: aiResult?.diagnosis_summary || null, probable_causes: aiResult?.probable_causes || [], labor_hours: aiResult?.labor_hours || null });
        }
      }
      return ok(res, { assistant_message: plan.assistant_message || null, requested_fields: plan.requested_fields || [], actions_performed: performed });
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

        if (req.method === 'DELETE') {
          if (!sharedSecretUsed && !isSystemAdmin) {
            return badRequest(res, 'system_admin_required');
          }
          const raw = await parseBody(req);
          const body = normalizePayload(raw);
          const id = String(body?.id || '').trim();
          if (!id) return badRequest(res, 'missing_id');
          const { error: delErr } = await supabase
            .from('tenants')
            .delete()
            .eq('id', id);
          if (delErr) return badRequest(res, delErr.message);
          return ok(res, { deleted: true, id });
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
    let isSystemAdmin = false;
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (API_SHARED_SECRET && bearerToken === API_SHARED_SECRET) {
      // Shared-secret: no tenant filter (list/create all)
      isSystemAdmin = true;
    } else {
      const authz = await authenticateAdmin(req);
      if (!authz.ok) return unauthorized(res);
      adminTenantId = authz.tenantId || null;
      isSystemAdmin = !!authz.isSystemAdmin;
    }

    if (req.method === 'POST') {
      try {
        const raw = await parseBody(req);
        const body = normalizePayload(raw);
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');
        const fullName = body?.full_name ? String(body.full_name) : undefined;
        const role = String(body?.role || '').toLowerCase();
        const explicitTenantId = body?.tenant_id ? String(body.tenant_id) : null;

        if (!email) return badRequest(res, 'missing_email');
        if (!password || password.length < 8) return badRequest(res, 'invalid_password_min_8_chars');
        const allowedRoles = ['admin', 'manager', 'operator'];
        const roleValid = !role || allowedRoles.includes(role);
        if (!roleValid) return badRequest(res, 'invalid_role');

        const userMeta = { full_name: fullName, role: role || 'operator' };
        // Superadmin: nunca auto-vincula; usa tenant_id se fornecido
        if (isSystemAdmin) {
          if (explicitTenantId) userMeta.tenant_id = explicitTenantId;
        } else if (adminTenantId) {
          // Admin comum: sempre vincula ao próprio tenant
          userMeta.tenant_id = adminTenantId;
        }

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
        if (isSystemAdmin) {
          if (explicitTenantId) profilePayload.tenant_id = explicitTenantId;
        } else if (adminTenantId) {
          profilePayload.tenant_id = adminTenantId;
        }

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

    if (req.method === 'PUT') {
      try {
        const raw = await parseBody(req);
        const body = normalizePayload(raw);
        const userId = String(body?.user_id || '').trim();
        if (!userId) return badRequest(res, 'missing_user_id');
        const updates = {};
        const role = body?.role ? String(body.role).toLowerCase() : undefined;
        const fullName = body?.full_name !== undefined ? String(body.full_name) : undefined;
        const password = body?.password ? String(body.password) : undefined;

        if (role && !['admin', 'manager', 'operator'].includes(role)) {
          return badRequest(res, 'invalid_role');
        }

        if (adminTenantId && !isSystemAdmin) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('user_id', userId)
            .maybeSingle();
          if (prof && prof.tenant_id !== adminTenantId) {
            cors(res);
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'forbidden_other_tenant' }));
          }
        }

        if (password) {
          const { error: updErr } = await supabase.auth.admin.updateUserById(userId, { password });
          if (updErr) return badRequest(res, updErr.message);
        }

        const profilePayload = {};
        if (fullName !== undefined) profilePayload.full_name = fullName || null;
        if (role !== undefined) profilePayload.role = role;

        if (Object.keys(profilePayload).length > 0) {
          const { error: upErr } = await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('user_id', userId);
          if (upErr) return badRequest(res, upErr.message);
        }

        return ok(res, { updated: true, user_id: userId });
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

        if (adminTenantId && !isSystemAdmin) {
          const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('user_id', userId).maybeSingle();
          if (prof && prof.tenant_id !== adminTenantId) {
            cors(res);
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'forbidden_other_tenant' }));
          }
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

  // Fast approval flow for quotes
  if (resource === 'quotes' && idMaybe === 'approve') {
    try {
      const authz = await getAuthAndTenant(req);
      if (!authz.authorized) return unauthorized(res);
      const tenantId = authz.tenantId || null;
      if (!tenantId) return badRequest(res, 'tenant_required');
      if (req.method !== 'POST') return notFound(res);
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const quoteId = String(body?.quote_id || '').trim();
      if (!quoteId) return badRequest(res, 'missing_quote_id');

      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_id, vehicle_id, vehicle_mileage')
        .eq('id', quoteId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (qErr) return badRequest(res, qErr.message);
      if (!quote) return badRequest(res, 'quote_not_found');

      const { error: upErr } = await supabase
        .from('quotes')
        .update({ status: 'aprovada', approved_date: new Date().toISOString() })
        .eq('id', quoteId)
        .eq('tenant_id', tenantId);
      if (upErr) return badRequest(res, upErr.message);

      const orderNumber = `OS-${quote.quote_number}`;
      const { data: serviceOrder, error: soErr } = await supabase
        .from('service_orders')
        .insert({
          quote_id: quote.id,
          order_number: orderNumber,
          customer_id: quote.customer_id,
          vehicle_id: quote.vehicle_id,
          vehicle_mileage: quote.vehicle_mileage,
          status: 'aguardando',
          tenant_id: tenantId,
        })
        .select('*')
        .single();
      if (soErr) return badRequest(res, soErr.message);

      return ok(res, { approved: true, order_number: orderNumber, service_order_id: serviceOrder.id });
    } catch (e) {
      cors(res);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
    }
  }
  if (resource === 'ai' && idMaybe === 'diagnose') {
    try {
      const authz = await getAuthAndTenant(req);
      if (!authz.authorized) return unauthorized(res);
      const tenantId = authz.tenantId || null;
      if (!tenantId) return badRequest(res, 'tenant_required');
      if (req.method !== 'POST') return notFound(res);
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const customerId = String(body?.customer_id || '').trim();
      const vehicleId = String(body?.vehicle_id || '').trim();
      const problemDescription = String(body?.problem_description || '').trim();
      if (!customerId || !vehicleId || !problemDescription) return badRequest(res, 'missing_fields');
      const { data: customer } = await supabase.from('customers').select('id,name,phone').eq('id', customerId).eq('tenant_id', tenantId).maybeSingle();
      const { data: vehicle } = await supabase.from('vehicles').select('id,brand,model,year,license_plate,current_mileage').eq('id', vehicleId).eq('tenant_id', tenantId).maybeSingle();
      if (!customer || !vehicle) return badRequest(res, 'customer_or_vehicle_not_found');
      const { data: catalog } = await supabase.from('service_items').select('id,name,type,sale_price,cost_price,default_warranty_days,replacement_period_days,replacement_mileage').eq('tenant_id', tenantId);
      const { data: pastItems } = await supabase
        .from('quote_items')
        .select('service_item_name,service_item_type,quantity,unit_price,cost_price,created_date,quote_id')
        .eq('tenant_id', tenantId)
        .in('quote_id', (await supabase.from('quotes').select('id').eq('vehicle_id', vehicleId).eq('tenant_id', tenantId)).data?.map(q => q.id) || []);
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      let aiResult = null;
      if (apiKey) {
        const prompt = [
          'Oficina mecânica. Gere diagnóstico e plano de serviço estruturado em JSON.',
          'Entrada:',
          `Cliente: ${customer.name}`,
          `Veículo: ${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} Placa ${vehicle.license_plate}`,
          `KM: ${vehicle.current_mileage || 0}`,
          `Problema relatado: ${problemDescription}`,
          `Histórico resumido de itens: ${(pastItems || []).slice(0, 30).map(i => `${i.service_item_name}`).join('; ') || 'sem histórico'}`,
          'Saída JSON com campos: diagnosis_summary, probable_causes[], labor_hours, recommended_services[].',
          'Cada recommended_services[] deve ter: name, type (servico|peca|produto), quantity, estimated_unit_price, estimated_cost_price, warranty_days, replacement_period_days, replacement_mileage.'
        ].join('\n');
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: 'Você é um assistente de oficina mecânica.' }, { role: 'user', content: prompt }],
            temperature: 0.2
          })
        });
        const json = await resp.json();
        const content = json?.choices?.[0]?.message?.content || '';
        try {
          aiResult = JSON.parse(content);
        } catch {
          aiResult = null;
        }
      }
      const recs = Array.isArray(aiResult?.recommended_services) ? aiResult.recommended_services : [];
      const mappedItems = recs.map(r => {
        const nameNorm = String(r.name || '').toLowerCase();
        const found = (catalog || []).find(s => {
          const sn = (s.name || '').toLowerCase();
          return sn.includes(nameNorm) || nameNorm.includes(sn);
        });
        const type = r.type === 'peca' || r.type === 'produto' ? r.type : (r.type === 'servico' ? 'servico' : (found?.type || 'servico'));
        const quantity = Number(r.quantity || 1);
        const unitPrice = found ? Number(found.sale_price || 0) : Number(r.estimated_unit_price || 0);
        const costPrice = found ? Number(found.cost_price || 0) : Number(r.estimated_cost_price || 0);
        const warrantyDays = Number(r.warranty_days || found?.default_warranty_days || 0);
        const replDays = Number(r.replacement_period_days || found?.replacement_period_days || 0);
        const replKm = Number(r.replacement_mileage || found?.replacement_mileage || 0);
        return {
          service_item_id: found?.id || null,
          service_item_name: found?.name || r.name || 'Item',
          service_item_type: type,
          quantity,
          unit_price: unitPrice,
          cost_price: costPrice,
          total: unitPrice * quantity,
          warranty_days: warrantyDays,
          replacement_period_days: replDays,
          replacement_mileage: replKm
        };
      });
      const subtotal = mappedItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
      const discountPercent = 0;
      const discountAmount = 0;
      const total = subtotal - discountAmount;
      const { data: quotesCountData } = await supabase.from('quotes').select('id').eq('tenant_id', tenantId);
      const nextNumber = (quotesCountData || []).length + 1;
      const quoteNumber = `COT-${String(nextNumber).padStart(6, '0')}`;
      const { data: createdQuote, error: qErr } = await supabase
        .from('quotes')
        .insert({
          customer_id: customerId,
          vehicle_id: vehicleId,
          quote_number: quoteNumber,
          status: 'em_analise',
          service_date: new Date().toISOString().split('T')[0],
          vehicle_mileage: vehicle.current_mileage || 0,
          subtotal,
          total,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          amount_paid: 0,
          amount_pending: total,
          payment_status: 'pendente',
          service_duration_hours: Number(aiResult?.labor_hours || 0),
          notes: aiResult?.diagnosis_summary || problemDescription,
          tenant_id: tenantId
        })
        .select('*')
        .single();
      if (qErr) return badRequest(res, qErr.message);
      for (const item of mappedItems) {
        await supabase
          .from('quote_items')
          .insert({
            quote_id: createdQuote.id,
            service_item_id: item.service_item_id,
            service_item_name: item.service_item_name,
            service_item_type: item.service_item_type,
            quantity: item.quantity,
            unit_price: item.unit_price,
            cost_price: item.cost_price,
            total: item.total,
            warranty_days: item.warranty_days,
            tenant_id: tenantId
          });
        const nextServiceDate = item.replacement_period_days > 0 ? new Date(Date.now() + item.replacement_period_days * 24 * 3600 * 1000).toISOString().split('T')[0] : null;
        const nextServiceMileage = item.replacement_mileage > 0 ? (vehicle.current_mileage || 0) + item.replacement_mileage : null;
        if (nextServiceDate || nextServiceMileage) {
          const message = `Lembrete: ${item.service_item_name} para ${customer.name} (${vehicle.brand} ${vehicle.model} ${vehicle.license_plate}).`;
          await supabase
            .from('maintenance_reminders')
            .insert({
              customer_id: customerId,
              vehicle_id: vehicleId,
              quote_id: createdQuote.id,
              service_name: item.service_item_name,
              reminder_type: nextServiceDate && nextServiceMileage ? 'ambos' : (nextServiceDate ? 'tempo' : 'quilometragem'),
              target_date: nextServiceDate,
              target_mileage: nextServiceMileage,
              status: 'pendente',
              whatsapp_message: message,
              customer_phone: customer.phone || null,
              tenant_id: tenantId
            });
        }
      }
      return ok(res, {
        quote_id: createdQuote.id,
        quote_number: createdQuote.quote_number,
        subtotal,
        total,
        items: mappedItems,
        diagnosis_summary: aiResult?.diagnosis_summary || null,
        probable_causes: aiResult?.probable_causes || [],
        labor_hours: aiResult?.labor_hours || null
      });
    } catch (e) {
      cors(res);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
    }
  }
  if (resource === 'ai' && idMaybe === 'vehicle-advice') {
    try {
      const authz = await getAuthAndTenant(req);
      if (!authz.authorized) return unauthorized(res);
      const tenantId = authz.tenantId || null;
      if (!tenantId) return badRequest(res, 'tenant_required');
      if (req.method !== 'POST') return notFound(res);
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const vehicleId = String(body?.vehicle_id || '').trim();
      if (!vehicleId) return badRequest(res, 'missing_vehicle_id');
      const { data: vehicle } = await supabase.from('vehicles').select('id,brand,model,year,license_plate,current_mileage,customer_id').eq('id', vehicleId).eq('tenant_id', tenantId).maybeSingle();
      if (!vehicle) return badRequest(res, 'vehicle_not_found');
      const { data: customer } = await supabase.from('customers').select('id,name,phone').eq('id', vehicle.customer_id).eq('tenant_id', tenantId).maybeSingle();
      const { data: items } = await supabase
        .from('quote_items')
        .select('service_item_name,service_item_type,quantity,unit_price,total,created_date')
        .eq('tenant_id', tenantId)
        .in('quote_id', (await supabase.from('quotes').select('id').eq('vehicle_id', vehicleId).eq('tenant_id', tenantId)).data?.map(q => q.id) || []);
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      let advice = null;
      if (apiKey) {
        const prompt = [
          'Analise histórico de serviços e gere recomendações de revisão preventiva em JSON.',
          `Veículo: ${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} Placa ${vehicle.license_plate}`,
          `KM: ${vehicle.current_mileage || 0}`,
          `Itens: ${(items || []).slice(0, 50).map(i => `${i.service_item_name}`).join('; ') || 'sem histórico'}`,
          'Saída JSON com fields: recommendations[], message_to_customer.'
        ].join('\n');
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: 'Você é um assistente de oficina mecânica.' }, { role: 'user', content: prompt }],
            temperature: 0.2
          })
        });
        const json = await resp.json();
        const content = json?.choices?.[0]?.message?.content || '';
        try {
          advice = JSON.parse(content);
        } catch {
          advice = null;
        }
      }
      return ok(res, {
        vehicle_id: vehicle.id,
        recommendations: advice?.recommendations || [],
        message_to_customer: advice?.message_to_customer || null
      });
    } catch (e) {
      cors(res);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
    }
  }
  // Superadmin: get current user's profile via backend (fallback when client fails)
  if (resource === 'admin' && idMaybe === 'profile') {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) return unauthorized(res);
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user?.id) return unauthorized(res);
      const userId = userData.user.id;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, role, tenant_id, tenant:tenants(name)')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return badRequest(res, error.message);
      return ok(res, data || {});
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
