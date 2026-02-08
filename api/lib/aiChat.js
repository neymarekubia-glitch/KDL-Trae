import OpenAI from 'openai';
import { getDiagnosticSuggestions } from './diagnosticKnowledge.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getSystemPrompt(tenantName) {
  const tenant = tenantName ? ` da oficina "${tenantName}"` : '';
  return `Você é o assistente operacional de um sistema de gestão para oficinas mecânicas. O sistema é MULTI-TENANT: você deve operar APENAS nos dados${tenant}. Nunca mencione ou acesse dados de outras oficinas.

REGRAS OBRIGATÓRIAS:
- NUNCA peça informações que o usuário já informou na conversa.
- Interprete sempre linguagem natural (ex.: "cliente João chegou com carro falhando", "cadastrar fornecedor Lubrificantes Ltda").
- Quando houver dados suficientes, EXECUTE a ação no sistema usando as ferramentas disponíveis.
- Quando faltar informação, solicite APENAS os campos faltantes.
- Sempre verifique se cliente ou veículo já existe antes de pedir cadastro.
- Responda toda mensagem com ação útil, análise ou pergunta objetiva.
- Para problema mecânico: SEMPRE forneça diagnóstico provável (causas, peças, tempo) ANTES de pedir dados administrativos.
- Após dar diagnóstico mecânico, pergunte: "Deseja que eu gere uma cotação automática com base nesse diagnóstico?"
- Seja profissional, direto e operacional.

FLUXO PARA SINTOMA MECÂNICO:
1) Dar diagnóstico técnico (causas prováveis).
2) Sugerir peças e serviços e tempo estimado.
3) Perguntar se deseja gerar cotação automática.
4) Se sim e tiver cliente/veículo (ou dados para cadastrar), criar cotação.

CONSULTAS: Para "quantas cotações abertas?", "quanto a receber?", "faturamento do mês?" use as ferramentas e responda com números e resumo claro.

CADASTROS VIA CHAT: Identifique cadastro (cliente, veículo, fornecedor), salve o que tiver, peça só o que faltar e confirme ao concluir.`;
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'list_customers',
      description: 'Lista clientes da oficina. Use para verificar se cliente já existe ou listar por nome.',
      parameters: {
        type: 'object',
        properties: {
          search_name: { type: 'string', description: 'Nome ou parte do nome para filtrar (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: 'Cadastra um novo cliente. Use quando o usuário pedir cadastro de cliente e tiver nome e telefone no mínimo.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome completo do cliente' },
          phone: { type: 'string', description: 'Telefone' },
          email: { type: 'string', description: 'E-mail (opcional)' },
          address: { type: 'string', description: 'Endereço (opcional)' },
          cpf_cnpj: { type: 'string', description: 'CPF ou CNPJ (opcional)' },
          notes: { type: 'string', description: 'Observações (opcional)' },
        },
        required: ['name', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_vehicles',
      description: 'Lista veículos. Pode filtrar por customer_id ou license_plate.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'UUID do cliente (opcional)' },
          license_plate: { type: 'string', description: 'Placa ou parte (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_vehicle',
      description: 'Cadastra um novo veículo. Cliente (customer_id) deve já existir.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'UUID do cliente dono do veículo' },
          license_plate: { type: 'string', description: 'Placa' },
          brand: { type: 'string', description: 'Marca' },
          model: { type: 'string', description: 'Modelo' },
          year: { type: 'integer', description: 'Ano (opcional)' },
          color: { type: 'string', description: 'Cor (opcional)' },
          current_mileage: { type: 'integer', description: 'Quilometragem atual (opcional)' },
          notes: { type: 'string', description: 'Observações (opcional)' },
        },
        required: ['customer_id', 'license_plate', 'brand', 'model'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_quotes',
      description: 'Lista cotações. Filtre por status: em_analise, aprovada, recusada, concluida.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'em_analise, aprovada, recusada ou concluida (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_quote_from_diagnostic',
      description: 'Cria uma cotação com itens sugeridos pelo diagnóstico. Gera número automático e itens a partir de peças/serviços sugeridos e catálogo da oficina.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'UUID do cliente' },
          vehicle_id: { type: 'string', description: 'UUID do veículo' },
          vehicle_mileage: { type: 'integer', description: 'Quilometragem atual (opcional)' },
          diagnostic_notes: { type: 'string', description: 'Resumo do diagnóstico/sintoma' },
          suggested_items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes de peças/serviços sugeridos (ex: Filtro de óleo, Troca de óleo)',
          },
        },
        required: ['customer_id', 'vehicle_id', 'diagnostic_notes', 'suggested_items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_service_items',
      description: 'Lista itens do catálogo (peças, serviços, produtos) para montar orçamento ou sugerir itens.',
      parameters: {
        type: 'object',
        properties: {
          type_filter: { type: 'string', description: 'peca, servico ou produto (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: 'Retorna resumo financeiro e operacional: faturamento do mês, a receber, cotações em análise, concluídas, etc.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_vehicle_history',
      description: 'Histórico do veículo: cotações, serviços realizados, quilometragem. Use para sugerir revisão geral.',
      parameters: {
        type: 'object',
        properties: {
          vehicle_id: { type: 'string', description: 'UUID do veículo' },
        },
        required: ['vehicle_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_diagnostic_suggestions',
      description: 'Dado um sintoma (ex: carro falhando, engasgando, aquecendo), retorna causas prováveis, peças e serviços sugeridos e tempo estimado.',
      parameters: {
        type: 'object',
        properties: {
          symptom: { type: 'string', description: 'Descrição do sintoma ou problema relatado' },
        },
        required: ['symptom'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_maintenance_reminder',
      description: 'Cria lembrete de manutenção para cliente/veículo (revisão, troca de óleo, etc.).',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string' },
          vehicle_id: { type: 'string' },
          service_name: { type: 'string' },
          reminder_type: { type: 'string', enum: ['tempo', 'quilometragem', 'ambos'] },
          target_date: { type: 'string', description: 'Data alvo (YYYY-MM-DD) se tipo tempo' },
          target_mileage: { type: 'integer', description: 'KM alvo se tipo quilometragem' },
          whatsapp_message: { type: 'string', description: 'Mensagem sugerida para WhatsApp (opcional)' },
        },
        required: ['customer_id', 'vehicle_id', 'service_name', 'reminder_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_suppliers',
      description: 'Lista fornecedores. Use quando usuário perguntar sobre fornecedores ou cadastrar um.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_supplier',
      description: 'Cadastra novo fornecedor. Peça apenas dados faltantes.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          contact_name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          address: { type: 'string' },
          cnpj: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
];

async function executeTool(name, args, supabase, tenantId) {
  const t = tenantId;
  if (!t) return { error: 'tenant_required' };

  switch (name) {
    case 'list_customers': {
      let q = supabase.from('customers').select('id, name, phone, email').eq('tenant_id', t).order('created_date', { ascending: false }).limit(50);
      if (args.search_name) {
        q = q.ilike('name', `%${args.search_name}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { customers: data || [] };
    }

    case 'create_customer': {
      const { name, phone, email, address, cpf_cnpj, notes } = args;
      if (!name || !phone) return { error: 'name and phone are required' };
      const { data, error } = await supabase
        .from('customers')
        .insert({ tenant_id: t, name, phone, email: email || null, address: address || null, cpf_cnpj: cpf_cnpj || null, notes: notes || null })
        .select('id, name, phone')
        .single();
      if (error) return { error: error.message };
      return { created: data, message: `Cliente ${data.name} cadastrado com sucesso.` };
    }

    case 'list_vehicles': {
      let q = supabase.from('vehicles').select('id, license_plate, brand, model, year, customer_id, current_mileage').eq('tenant_id', t).order('created_date', { ascending: false }).limit(80);
      if (args.customer_id) q = q.eq('customer_id', args.customer_id);
      if (args.license_plate) q = q.ilike('license_plate', `%${args.license_plate}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { vehicles: data || [] };
    }

    case 'create_vehicle': {
      const { customer_id, license_plate, brand, model, year, color, current_mileage, notes } = args;
      if (!customer_id || !license_plate || !brand || !model) return { error: 'customer_id, license_plate, brand and model are required' };
      const { data, error } = await supabase
        .from('vehicles')
        .insert({
          tenant_id: t,
          customer_id,
          license_plate: String(license_plate).trim().toUpperCase(),
          brand,
          model,
          year: year || null,
          color: color || null,
          current_mileage: current_mileage || 0,
          notes: notes || null,
        })
        .select('id, license_plate, brand, model')
        .single();
      if (error) return { error: error.message };
      return { created: data, message: `Veículo ${data.brand} ${data.model} - ${data.license_plate} cadastrado.` };
    }

    case 'list_quotes': {
      let q = supabase.from('quotes').select('id, quote_number, status, total, service_date, customer_id, vehicle_id').eq('tenant_id', t).order('created_date', { ascending: false }).limit(100);
      if (args.status) q = q.eq('status', args.status);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { quotes: data || [] };
    }

    case 'list_service_items': {
      let q = supabase.from('service_items').select('id, name, type, sale_price, cost_price').eq('tenant_id', t).eq('is_active', true).order('name').limit(200);
      if (args.type_filter) q = q.eq('type', args.type_filter);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { service_items: data || [] };
    }

    case 'get_dashboard_stats': {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id, status, total, amount_paid, amount_pending')
        .eq('tenant_id', t)
        .gte('created_date', startMonth)
        .lte('created_date', endMonth);
      const completed = (quotes || []).filter((q) => q.status === 'concluida');
      const revenue = completed.reduce((s, q) => s + (q.amount_paid || 0), 0);
      const pendingPayment = completed.reduce((s, q) => s + (q.amount_pending || 0), 0);
      const { data: allQuotes } = await supabase.from('quotes').select('status').eq('tenant_id', t);
      const byStatus = (allQuotes || []).reduce((acc, q) => {
        acc[q.status] = (acc[q.status] || 0) + 1;
        return acc;
      }, {});
      return {
        revenue_this_month: revenue,
        pending_payment: pendingPayment,
        quotes_em_analise: byStatus.em_analise || 0,
        quotes_aprovada: byStatus.aprovada || 0,
        quotes_concluida: byStatus.concluida || 0,
        quotes_recusada: byStatus.recusada || 0,
      };
    }

    case 'get_vehicle_history': {
      const vid = args.vehicle_id;
      if (!vid) return { error: 'vehicle_id required' };
      const { data: vehicle } = await supabase.from('vehicles').select('id, brand, model, license_plate, current_mileage').eq('id', vid).eq('tenant_id', t).single();
      if (!vehicle) return { error: 'Veículo não encontrado.' };
      const { data: quoteList } = await supabase.from('quotes').select('id, quote_number, status, total, service_date, vehicle_mileage').eq('vehicle_id', vid).eq('tenant_id', t).order('service_date', { ascending: false }).limit(20);
      return { vehicle, quotes: quoteList || [] };
    }

    case 'get_diagnostic_suggestions': {
      const symptom = args.symptom || '';
      const result = getDiagnosticSuggestions(symptom);
      return result;
    }

    case 'create_maintenance_reminder': {
      const { customer_id, vehicle_id, service_name, reminder_type, target_date, target_mileage, whatsapp_message } = args;
      if (!customer_id || !vehicle_id || !service_name || !reminder_type) return { error: 'customer_id, vehicle_id, service_name and reminder_type required' };
      const { data, error } = await supabase
        .from('maintenance_reminders')
        .insert({
          tenant_id: t,
          customer_id,
          vehicle_id,
          service_name,
          reminder_type,
          target_date: target_date || null,
          target_mileage: target_mileage || null,
          whatsapp_message: whatsapp_message || null,
          status: 'pendente',
        })
        .select('id, service_name, target_date, target_mileage')
        .single();
      if (error) return { error: error.message };
      return { created: data, message: 'Lembrete de manutenção criado.' };
    }

    case 'list_suppliers': {
      const { data, error } = await supabase.from('suppliers').select('id, name, phone, email').eq('tenant_id', t).order('name').limit(50);
      if (error) return { error: error.message };
      return { suppliers: data || [] };
    }

    case 'create_supplier': {
      const { name, contact_name, phone, email, address, cnpj, notes } = args;
      if (!name) return { error: 'name is required' };
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          tenant_id: t,
          name,
          contact_name: contact_name || null,
          phone: phone || null,
          email: email || null,
          address: address || null,
          cnpj: cnpj || null,
          notes: notes || null,
        })
        .select('id, name')
        .single();
      if (error) return { error: error.message };
      return { created: data, message: `Fornecedor ${data.name} cadastrado.` };
    }

    case 'create_quote_from_diagnostic': {
      const { customer_id, vehicle_id, vehicle_mileage, diagnostic_notes, suggested_items } = args;
      if (!customer_id || !vehicle_id || !diagnostic_notes || !Array.isArray(suggested_items)) {
        return { error: 'customer_id, vehicle_id, diagnostic_notes and suggested_items (array) are required' };
      }
      const { data: existingQuotes } = await supabase.from('quotes').select('id').eq('tenant_id', t);
      const nextNum = (existingQuotes?.length || 0) + 1;
      const quote_number = `COT-${String(nextNum).padStart(6, '0')}`;
      const service_date = new Date().toISOString().split('T')[0];
      const { data: catalog } = await supabase.from('service_items').select('id, name, type, sale_price, cost_price').eq('tenant_id', t).eq('is_active', true);
      const itemsToAdd = [];
      const used = new Set();
      for (const suggested of suggested_items) {
        const nameLower = String(suggested).toLowerCase();
        const match = (catalog || []).find((c) => c.name.toLowerCase().includes(nameLower) || nameLower.includes(c.name.toLowerCase()));
        if (match && !used.has(match.id)) {
          used.add(match.id);
          itemsToAdd.push({
            service_item_id: match.id,
            service_item_name: match.name,
            service_item_type: match.type,
            quantity: 1,
            unit_price: match.sale_price || 0,
            cost_price: match.cost_price || 0,
            total: match.sale_price || 0,
          });
        } else if (!match && suggested) {
          itemsToAdd.push({
            service_item_id: null,
            service_item_name: String(suggested).trim(),
            service_item_type: 'servico',
            quantity: 1,
            unit_price: 0,
            cost_price: 0,
            total: 0,
          });
        }
      }
      if (itemsToAdd.length === 0) {
        itemsToAdd.push({
          service_item_id: null,
          service_item_name: `Diagnóstico / Serviço: ${diagnostic_notes.substring(0, 80)}`,
          service_item_type: 'servico',
          quantity: 1,
          unit_price: 0,
          cost_price: 0,
          total: 0,
        });
      }
      const subtotal = itemsToAdd.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
      const total = subtotal;
      const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          tenant_id: t,
          customer_id,
          vehicle_id,
          quote_number,
          status: 'em_analise',
          service_date,
          vehicle_mileage: vehicle_mileage || 0,
          subtotal,
          total,
          discount_percent: 0,
          discount_amount: 0,
          amount_paid: 0,
          amount_pending: total,
          payment_status: 'pendente',
          notes: diagnostic_notes,
        })
        .select('id, quote_number, total')
        .single();
      if (quoteErr) return { error: quoteErr.message };
      for (const it of itemsToAdd) {
        await supabase.from('quote_items').insert({
          tenant_id: t,
          quote_id: quote.id,
          service_item_id: it.service_item_id,
          service_item_name: it.service_item_name,
          service_item_type: it.service_item_type,
          quantity: it.quantity,
          unit_price: it.unit_price,
          cost_price: it.cost_price,
          total: it.unit_price * it.quantity,
        });
      }
      return {
        created: { id: quote.id, quote_number: quote.quote_number, total: quote.total },
        message: `Cotação ${quote.quote_number} criada com ${itemsToAdd.length} item(ns). Total estimado R$ ${Number(quote.total).toFixed(2)}. O mecânico pode revisar na tela de Cotações.`,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function friendlyOpenAIError(err) {
  const msg = err?.message || '';
  const code = err?.status || err?.code;
  if (code === 429 || msg.includes('quota') || msg.includes('exceeded')) {
    return 'Limite de uso da OpenAI atingido. Verifique seu plano e cobrança em https://platform.openai.com/ (Billing / Usage).';
  }
  if (code === 401 || msg.includes('invalid') && msg.includes('key')) {
    return 'Chave da OpenAI inválida ou expirada. Verifique OPENAI_API_KEY no Vercel.';
  }
  if (code === 429 && msg.includes('rate')) {
    return 'Muitas requisições no momento. Aguarde alguns segundos e tente de novo.';
  }
  return msg || 'Erro ao comunicar com o assistente. Tente novamente.';
}

async function runChat(messages, tenantId, tenantName, supabase) {
  if (!OPENAI_API_KEY) {
    return { error: 'OPENAI_API_KEY não configurada. Configure a variável no Vercel (Settings > Environment Variables).' };
  }
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const systemPrompt = getSystemPrompt(tenantName);
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  let result;
  let maxRounds = 5;
  try {
    while (maxRounds--) {
      result = await openai.chat.completions.create({
        model: MODEL,
        messages: fullMessages,
        tools: toolDefinitions.length ? toolDefinitions : undefined,
        tool_choice: toolDefinitions.length ? 'auto' : undefined,
      });

      const choice = result.choices?.[0];
      if (!choice) return { error: 'Resposta vazia do assistente.' };

      const toolCalls = choice.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return { message: choice.message?.content || 'Sem resposta.', finish_reason: choice.finish_reason };
      }

      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let toolArgs = {};
        try {
          if (tc.function?.arguments) toolArgs = JSON.parse(tc.function.arguments);
        } catch (_) {}
        const output = await executeTool(name, toolArgs, supabase, tenantId);
        fullMessages.push({
          role: 'assistant',
          content: null,
          tool_calls: [tc],
        });
        fullMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(output),
        });
      }
    }

    return { message: 'Limite de etapas atingido. Tente reformular.', finish_reason: 'length' };
  } catch (err) {
    const friendly = friendlyOpenAIError(err);
    return { error: friendly };
  }
}

async function handleAIChat(req, res, auth, supabase) {
  cors(res);
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }

  if (!auth.authorized || !auth.tenantId) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'unauthorized', detail: 'tenant_required' }));
  }

  let body = {};
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      const raw = await new Promise((resolve, reject) => {
        let b = '';
        req.on('data', (c) => (b += c));
        req.on('end', () => {
          try {
            resolve(b ? JSON.parse(b) : {});
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
      body = raw;
    }
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'invalid_json', message: e?.message }));
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 && body.message) {
    messages.push({ role: 'user', content: body.message });
  }
  if (messages.length === 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'messages or message required' }));
  }

  let tenantName = null;
  let creditsLimit = null;
  let creditsUsed = 0;
  let creditsEnabled = false;
  try {
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenants')
      .select('name, ai_credits_limit, ai_credits_used_this_month, ai_credits_reset_at')
      .eq('id', auth.tenantId)
      .maybeSingle();
    if (!tenantErr && tenantRow) {
      tenantName = tenantRow.name ?? null;
      if (tenantRow.ai_credits_limit != null) {
        creditsEnabled = true;
        creditsLimit = Number(tenantRow.ai_credits_limit) || 50;
        creditsUsed = Number(tenantRow.ai_credits_used_this_month) || 0;
        const resetAt = tenantRow.ai_credits_reset_at ? new Date(tenantRow.ai_credits_reset_at) : null;
        const now = new Date();
        if (resetAt && now >= resetAt) {
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          await supabase
            .from('tenants')
            .update({
              ai_credits_used_this_month: 0,
              ai_credits_reset_at: nextMonth.toISOString(),
            })
            .eq('id', auth.tenantId);
          creditsUsed = 0;
        }
        if (creditsUsed >= creditsLimit) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              error:
                'Limite de créditos do mês atingido. Entre em contato com o suporte para aumentar seu plano ou aguarde o próximo mês.',
              credits_used_this_month: creditsUsed,
              credits_limit: creditsLimit,
            })
          );
        }
      }
    }
  } catch (_) {}

  let usedAfter = creditsUsed;
  if (creditsEnabled && creditsLimit != null) {
    const { data: updated } = await supabase
      .from('tenants')
      .update({ ai_credits_used_this_month: creditsUsed + 1 })
      .eq('id', auth.tenantId)
      .select('ai_credits_used_this_month')
      .single();
    usedAfter = updated?.ai_credits_used_this_month ?? creditsUsed + 1;
  }

  try {
    const result = await runChat(messages, auth.tenantId, tenantName, supabase);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    const payload = { ...result };
    if (creditsEnabled && creditsLimit != null) {
      payload.credits_used_this_month = usedAfter;
      payload.credits_limit = creditsLimit;
    }
    res.end(JSON.stringify(payload));
  } catch (e) {
    console.error('[AI Chat]', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
  }
}

export { handleAIChat, getSystemPrompt, executeTool };
