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
- Faça SOMENTE o que o usuário pediu. Nunca crie cotação, cadastre itens ou execute ações que o usuário não solicitou explicitamente.
- NUNCA peça informações que o usuário já informou na conversa.
- NUNCA invente erros. Só informe "não foi possível" ou "erro de associação" se a ferramenta tiver retornado um erro real. Antes de desistir, use list_customers e list_vehicles para obter os IDs e chame create_quote_from_diagnostic ou create_service_item.
- Quando o usuário pedir várias coisas em sequência (ex.: "crie o serviço X por Y reais, o serviço Z por W reais e crie as cotações"), execute todas: cadastre os serviços e em seguida crie cada cotação com os itens que o usuário pediu para cada cliente. Não pare com mensagem genérica de erro.
- Interprete linguagem natural. Quando houver dados suficientes, execute. Seja profissional e direto.

RELATO DE SINTOMA (ex.: "Cliente X relatou que o carro está falhando", "carro morrendo no semáforo"):
- Se o cliente tiver MAIS DE UM veículo cadastrado: antes de dar o diagnóstico, pergunte qual veículo (placa ou modelo), usando list_vehicles com o customer_id do cliente. Ex.: "Carlos Henrique tem 2 veículos (Fiat Uno ABC1D23 e Fiat Strada ASD2P45). Qual deles está com o problema?"
- Se o cliente tiver só um veículo, vá direto ao diagnóstico.
- Responda SOMENTE com o diagnóstico técnico (causas prováveis, peças sugeridas, serviços sugeridos, tempo estimado). Use get_diagnostic_suggestions. NÃO chame create_quote_from_diagnostic nem create_service_item. Pode encerrar com: "Se quiser cadastrar itens no catálogo ou gerar uma cotação depois, é só pedir."

PEDIDO DE CADASTRAR ITEM NO CATÁLOGO:
- NUNCA invente preço. Se o usuário pedir cadastrar um ou mais serviços/itens sem informar o preço de venda (ex.: "crie os serviços Revisão completa, Inspeção geral e Verificação do sistema de ignição"), pergunte antes: "Qual o preço de venda para cada um?" ou "Quais os preços de venda para [lista]?" Só chame create_service_item quando tiver o sale_price informado pelo usuário para cada item.
- Para vincular ao fornecedor, use supplier_name no mesmo chamado. Se o usuário informar todos os dados (nome, tipo, preço, custo), use-os; não peça de novo. Se a ferramenta retornar already_exists, informe que o item já está cadastrado. Verifique com list_service_items se já existe item com o mesmo nome para evitar duplicata.

PEDIDO DE CRIAR COTAÇÃO:
- Para CADA cliente na mesma solicitação: antes de create_quote_from_diagnostic, chame list_vehicles(customer_id). Se o cliente tiver MAIS DE UM veículo, NÃO assuma o veículo pelo texto do diagnóstico anterior; pergunte explicitamente: "Para [Nome do cliente], qual veículo? (ele/a tem X: [lista placa/modelo])". Só crie a cotação depois que o usuário indicar o veículo (ou a placa) NESSA conversa. Se o cliente tem só um veículo, use esse sem perguntar.
- suggested_items na cotação deve conter SOMENTE o(s) item(ns) que o usuário pediu para aquela cotação.
- Para obter customer_id e vehicle_id: use list_customers (search_name = nome do cliente) e list_vehicles (customer_id). Se o usuário indicou placa, use o veículo com essa placa. NUNCA diga "problema de associação" sem ter chamado essas ferramentas.
- Se o usuário pedir "crie o serviço X por Y reais e inspeção geral por Z reais e pode criar as cotações": (1) crie cada serviço com create_service_item (nome, type: servico, sale_price); (2) em seguida crie cada cotação com create_quote_from_diagnostic usando customer_id e vehicle_id obtidos por list_customers/list_vehicles e suggested_items exatamente como o usuário pediu para cada cliente. Execute todos os passos; não desista com mensagem genérica de erro.
- Se faltar item no catálogo para uma cotação: cadastre-o antes com create_service_item (com o preço que o usuário informar) e depois crie a cotação. Não informe "não foi possível por associação" ou similar sem ter tentado obter os IDs e criar.

APROVAR COTAÇÕES: Quando o usuário pedir aprovar cotações (ex.: "aprovar as 3 cotações", "quero aprovar as cotações abertas"), use list_quotes com status em_analise para obter os id das cotações e chame approve_quotes com a lista de quote_ids. Você tem capacidade de aprovar cotações; não diga que não pode.

CONSULTAS E TOTAIS: Ao responder "quantas cotações abertas" ou "valor total estimado" ou "faturamento previsto", use list_quotes (status em_analise) e calcule o total SOMANDO o campo "total" de cada cotação retornada pela ferramenta. Nunca invente ou troque valores: use apenas os números retornados pela última chamada e escreva a soma correta (ex.: 150 + 700 + 400 = 1250).

CATÁLOGO: Cotações usam só itens do catálogo com preço. Nunca crie cotação com total R$ 0,00.

RESUMO: Cotação = só os itens que o usuário pediu para aquele cliente. Sempre use list_customers e list_vehicles para obter IDs. Se pedir "crie serviços A e B e depois as cotações", crie A, B e em seguida as cotações.`;
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
      name: 'approve_quotes',
      description: 'Aprova uma ou mais cotações (status em_analise → aprovada) e gera ordem de serviço para cada uma. Use list_quotes com status em_analise para obter os quote_id antes, se o usuário pedir "aprovar as 3 cotações" ou "quero aprovar as cotações abertas".',
      parameters: {
        type: 'object',
        properties: {
          quote_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de UUIDs das cotações a aprovar',
          },
        },
        required: ['quote_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_quote_from_diagnostic',
      description: 'Cria uma cotação. Obtenha customer_id com list_customers e vehicle_id com list_vehicles(customer_id). Se list_vehicles retornar mais de um veículo, NÃO assuma qual é; o assistente deve perguntar ao usuário qual veículo (placa ou modelo) antes de chamar esta ferramenta. suggested_items = apenas os itens pedidos para esta cotação. Itens devem existir no catálogo com preço.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'UUID do cliente (obtido com list_customers)' },
          vehicle_id: { type: 'string', description: 'UUID do veículo (obtido com list_vehicles)' },
          vehicle_mileage: { type: 'integer', description: 'Quilometragem atual (opcional)' },
          diagnostic_notes: { type: 'string', description: 'Resumo do diagnóstico/sintoma' },
          suggested_items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Apenas os nomes dos itens que o usuário pediu para esta cotação (ex.: um único item ou a lista exata solicitada)',
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
  {
    type: 'function',
    function: {
      name: 'create_service_item',
      description: 'Cadastra item no catálogo: produto, peça ou serviço. NUNCA invente preço: sale_price deve ser o valor informado pelo usuário. Se o usuário pedir cadastrar vários itens sem informar preços, pergunte os preços antes de chamar esta ferramenta. Pode vincular fornecedor por supplier_name. Não duplica: se já existir item com o mesmo nome, retorna aviso.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do item (ex: Óleo 5W30, Troca de Óleo, Jogo de Velas)' },
          type: { type: 'string', enum: ['produto', 'peca', 'servico'], description: 'Tipo: produto, peca ou servico' },
          sale_price: { type: 'number', description: 'Preço de venda' },
          cost_price: { type: 'number', description: 'Preço de custo (pode ser 0 para serviço)' },
          supplier_id: { type: 'string', description: 'UUID do fornecedor (opcional)' },
          supplier_name: { type: 'string', description: 'Nome do fornecedor para vincular (opcional; use se não tiver UUID)' },
          current_stock: { type: 'integer', description: 'Estoque atual (opcional, default 0)' },
          minimum_stock: { type: 'integer', description: 'Estoque mínimo (opcional, default 0)' },
        },
        required: ['name', 'type', 'sale_price'],
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

    case 'approve_quotes': {
      const ids = Array.isArray(args.quote_ids) ? args.quote_ids.filter((id) => id && String(id).trim()) : [];
      if (ids.length === 0) return { error: 'quote_ids (array com pelo menos um UUID) é obrigatório' };
      const results = [];
      for (const quoteId of ids) {
        const { data: quote, error: qErr } = await supabase
          .from('quotes')
          .select('id, quote_number, customer_id, vehicle_id, vehicle_mileage')
          .eq('id', quoteId)
          .eq('tenant_id', t)
          .eq('status', 'em_analise')
          .maybeSingle();
        if (qErr) {
          results.push({ quote_id: quoteId, error: qErr.message });
          continue;
        }
        if (!quote) {
          results.push({ quote_id: quoteId, error: 'Cotação não encontrada ou já não está em análise' });
          continue;
        }
        const { error: upErr } = await supabase
          .from('quotes')
          .update({ status: 'aprovada', approved_date: new Date().toISOString() })
          .eq('id', quoteId)
          .eq('tenant_id', t);
        if (upErr) {
          results.push({ quote_id: quoteId, error: upErr.message });
          continue;
        }
        const orderNumber = `OS-${quote.quote_number}`;
        const { data: serviceOrder, error: soErr } = await supabase
          .from('service_orders')
          .insert({
            quote_id: quote.id,
            order_number: orderNumber,
            customer_id: quote.customer_id,
            vehicle_id: quote.vehicle_id,
            vehicle_mileage: quote.vehicle_mileage || null,
            status: 'aguardando',
            tenant_id: t,
          })
          .select('id, order_number')
          .single();
        if (soErr) {
          results.push({ quote_id: quoteId, approved: true, order_error: soErr.message });
        } else {
          results.push({ quote_id: quoteId, approved: true, order_number: serviceOrder.order_number, service_order_id: serviceOrder.id });
        }
      }
      const okCount = results.filter((r) => r.approved).length;
      return { results, message: `${okCount} cotação(ões) aprovada(s).${okCount < results.length ? ' Algumas falharam.' : ''}` };
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

    case 'create_service_item': {
      const { name, type: itemType, sale_price, cost_price, supplier_id, supplier_name, current_stock, minimum_stock } = args;
      if (!name || !itemType) return { error: 'name and type (produto, peca or servico) are required' };
      const validType = ['servico', 'peca', 'produto'].includes(String(itemType).toLowerCase()) ? String(itemType).toLowerCase() : 'servico';
      const sale = Number(sale_price);
      const cost = Number(cost_price);
      if (!Number.isFinite(sale) || sale < 0) return { error: 'sale_price must be a non-negative number' };
      const nameTrim = String(name).trim();
      const { data: existing } = await supabase
        .from('service_items')
        .select('id, name')
        .eq('tenant_id', t)
        .ilike('name', nameTrim)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return { error: 'already_exists', message: `Item "${existing.name}" já está cadastrado no catálogo. Não foi criado duplicado.` };
      }
      let resolvedSupplierId = null;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (supplier_id && uuidRegex.test(String(supplier_id).trim())) {
        resolvedSupplierId = supplier_id.trim();
      } else if (supplier_name && String(supplier_name).trim()) {
        const { data: supRow } = await supabase
          .from('suppliers')
          .select('id')
          .eq('tenant_id', t)
          .ilike('name', `%${String(supplier_name).trim()}%`)
          .limit(1)
          .maybeSingle();
        if (supRow) resolvedSupplierId = supRow.id;
      }
      const { data, error } = await supabase
        .from('service_items')
        .insert({
          tenant_id: t,
          name: nameTrim,
          type: validType,
          sale_price: Number.isFinite(sale) ? sale : 0,
          cost_price: Number.isFinite(cost) ? cost : 0,
          supplier_id: resolvedSupplierId,
          current_stock: Number.isFinite(Number(current_stock)) ? Math.max(0, Number(current_stock)) : 0,
          minimum_stock: Number.isFinite(Number(minimum_stock)) ? Math.max(0, Number(minimum_stock)) : 0,
          is_active: true,
        })
        .select('id, name, type, sale_price, supplier_id')
        .single();
      if (error) return { error: error.message };
      const supplierMsg = resolvedSupplierId ? ' (fornecedor vinculado)' : '';
      return { created: data, message: `Item "${data.name}" (${validType}) cadastrado no catálogo com preço R$ ${Number(data.sale_price).toFixed(2)}${supplierMsg}.` };
    }

    case 'create_quote_from_diagnostic': {
      const { customer_id, vehicle_id, vehicle_mileage, diagnostic_notes, suggested_items } = args;
      if (!customer_id || !vehicle_id || !diagnostic_notes || !Array.isArray(suggested_items)) {
        return { error: 'customer_id, vehicle_id, diagnostic_notes and suggested_items (array) are required' };
      }
      const { data: catalog } = await supabase.from('service_items').select('id, name, type, sale_price, cost_price').eq('tenant_id', t).eq('is_active', true);
      const itemsToAdd = [];
      const used = new Set();
      for (const suggested of suggested_items) {
        const nameLower = String(suggested).toLowerCase().trim();
        const match = (catalog || []).find((c) => {
          if (used.has(c.id)) return false;
          const cName = (c.name || '').toLowerCase();
          return cName.includes(nameLower) || nameLower.includes(cName) || nameLower.split(/\s+/).some((w) => w.length > 2 && cName.includes(w));
        });
        if (match && (match.sale_price || 0) > 0) {
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
        }
      }
      const subtotal = itemsToAdd.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
      if (itemsToAdd.length === 0 || subtotal <= 0) {
        const missing = suggested_items.filter((s) => !itemsToAdd.some((i) => (i.service_item_name || '').toLowerCase().includes(String(s).toLowerCase()))).slice(0, 8);
        return {
          error: 'no_catalog_match',
          message: 'Não foi possível criar a cotação: não há itens no catálogo com preço que correspondam aos itens sugeridos. Cadastre os itens no Catálogo (use create_service_item ou o menu Catálogo) e depois peça para gerar a cotação novamente.',
          suggested_items_not_found: missing,
        };
      }
      const { data: existingQuotes } = await supabase.from('quotes').select('id').eq('tenant_id', t);
      const nextNum = (existingQuotes?.length || 0) + 1;
      const quote_number = `COT-${String(nextNum).padStart(6, '0')}`;
      const service_date = new Date().toISOString().split('T')[0];
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
    return 'O assistente está temporariamente indisponível. Por favor, tente novamente mais tarde ou entre em contato com o suporte.';
  }
  if (code === 401 || (msg.includes('invalid') && msg.includes('key'))) {
    return 'O assistente não está disponível no momento. Entre em contato com o suporte.';
  }
  if (code === 429 && msg.includes('rate')) {
    return 'Muitas requisições no momento. Aguarde alguns segundos e tente novamente.';
  }
  return 'O assistente encontrou um erro. Por favor, tente novamente ou entre em contato com o suporte.';
}

async function runChat(messages, tenantId, tenantName, supabase) {
  if (!OPENAI_API_KEY) {
    return { error: 'O assistente não está disponível no momento. Entre em contato com o suporte.' };
  }
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const systemPrompt = getSystemPrompt(tenantName);
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  let result;
  let maxRounds = 12;
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
