/**
 * Base de conhecimento: sintoma -> causas prováveis, peças/serviços sugeridos e tempo estimado.
 * Usado pelo assistente de IA para diagnóstico mecânico e sugestão de cotação.
 * Todas as chaves em minúsculo para busca case-insensitive.
 */
const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();

const KNOWLEDGE = [
  {
    keywords: ['falhando', 'falha', 'misfire', 'falha no motor', 'trepidando'],
    causes: ['Vela de ignição com defeito ou desgastada', 'Bobina de ignição', 'Cabos de vela', 'Sistema de combustível (bomba, bicos)', 'Sensor de oxigênio ou MAP'],
    parts: ['Velas de ignição', 'Bobina(s) de ignição', 'Cabos de vela', 'Filtro de combustível'],
    services: ['Troca de velas', 'Verificação do sistema de ignição', 'Limpeza de bicos ou diagnóstico de combustível'],
    estimated_hours: 1.5,
  },
  {
    keywords: ['engasgando', 'engasga', 'acelerar', 'aceleração'],
    causes: ['Filtro de ar obstruído', 'Bicos injetores sujos ou com defeito', 'Bomba de combustível fraca', 'Sensor TPS (acelerador)', 'Sistema de ignição'],
    parts: ['Filtro de ar', 'Filtro de combustível', 'Kit limpeza de bicos (ou diagnóstico)'],
    services: ['Troca de filtro de ar', 'Limpeza de bicos injetores', 'Verificação de combustível e sensores'],
    estimated_hours: 2,
  },
  {
    keywords: ['barulho', 'ruído', 'batendo', 'batida', 'grilo', 'chiado'],
    causes: ['Correia dentada ou alternador', 'Tensão de correia', 'Rolamentos (polia, alternador)', 'Amortecedor ou suspensão', 'Freios (pastilhas, discos)'],
    parts: ['Correia dentada', 'Tensor', 'Pastilhas de freio', 'Discos de freio', 'Kit de rolamentos (conforme diagnóstico)'],
    services: ['Inspeção de correias e polias', 'Troca de pastilhas/discos', 'Revisão de suspensão'],
    estimated_hours: 1.5,
  },
  {
    keywords: ['aquecendo', 'esquenta', 'superaquecimento', 'temperatura', 'fervendo'],
    causes: ['Vazamento no sistema de arrefecimento', 'Radiador entupido ou com vazamento', 'Bomba d\'água', 'Válvula termostática', 'Vazamento de junta do cabeçote'],
    parts: ['Líquido de arrefecimento', 'Mangueiras', 'Termostato', 'Bomba d\'água', 'Radiador (conforme necessidade)'],
    services: ['Verificação do sistema de arrefecimento', 'Troca de líquido e termostato', 'Troca de bomba d\'água'],
    estimated_hours: 2.5,
  },
  {
    keywords: ['freio', 'freios', 'pedal', 'pastilha', 'disco'],
    causes: ['Pastilhas ou lonas desgastadas', 'Discos ou tambores desgastados', 'Fluido de freio baixo ou vencido', 'Cilindro ou pinça com vazamento'],
    parts: ['Pastilhas de freio', 'Discos de freio', 'Fluido de freio', 'Lonas (freio a tambor)'],
    services: ['Troca de pastilhas e/ou discos', 'Sangria do sistema', 'Revisão completa de freios'],
    estimated_hours: 2,
  },
  {
    keywords: ['óleo', 'vazando', 'vazamento', 'gotejando'],
    causes: ['Junta do cárter ou tampa de válvulas', 'Retentor do eixo', 'Bomba de óleo ou vedação', 'Filtro de óleo mal rosqueado'],
    parts: ['Kit de juntas (cárter/tampa)', 'Retentores', 'Óleo do motor', 'Filtro de óleo'],
    services: ['Localização do vazamento', 'Troca de juntas/retentores', 'Troca de óleo e filtro'],
    estimated_hours: 2,
  },
  {
    keywords: ['bateria', 'não pega', 'não dá partida', 'partida', 'arranque'],
    causes: ['Bateria descarregada ou defeituosa', 'Alternador não carregando', 'Mangote ou borne solto', 'Motor de partida com defeito'],
    parts: ['Bateria', 'Mangote de bateria', 'Alternador (conforme diagnóstico)', 'Motor de partida (conforme diagnóstico)'],
    services: ['Teste de bateria e alternador', 'Troca de bateria', 'Revisão elétrica'],
    estimated_hours: 1,
  },
  {
    keywords: ['direção', 'duro', 'pesado', 'folga', 'barulho direção'],
    causes: ['Fluido de direção baixo ou vencido', 'Bomba ou cremalheira com defeito', 'Correia da bomba', 'Terminais e bandejas desgastados'],
    parts: ['Fluido de direção', 'Bomba de direção', 'Cremalheira ou caixa', 'Terminais de direção', 'Bandejas'],
    services: ['Troca de fluido', 'Verificação do sistema', 'Troca de terminais/bandejas'],
    estimated_hours: 1.5,
  },
  {
    keywords: ['suspensão', 'balanço', 'rebola', 'barulho baixo', 'amortecedor'],
    causes: ['Amortecedores desgastados', 'Molas ou coxins', 'Buchas de bandeja', 'Estabilizadora'],
    parts: ['Amortecedores', 'Coxins de mola', 'Buchas', 'Kit de suspensão (conforme veículo)'],
    services: ['Revisão de suspensão', 'Troca de amortecedores', 'Alinhamento'],
    estimated_hours: 2.5,
  },
  {
    keywords: ['ar condicionado', 'ar condicionado não gela', 'climatização', 'não gelando'],
    causes: ['Gás refrigerante baixo ou vazamento', 'Compressor com defeito', 'Condensador ou evaporador', 'Válvula de expansão'],
    parts: ['Gás refrigerante', 'Compressor', 'Condensador/evaporador (conforme diagnóstico)', 'Filtro de cabine'],
    services: ['Recarga de gás', 'Detecção de vazamento', 'Troca de compressor ou componentes'],
    estimated_hours: 2,
  },
  {
    keywords: ['elétrico', 'luz painel', 'fusível', 'curto', 'não acende'],
    causes: ['Fusível queimado', 'Fiação danificada', 'Módulo ou relé com defeito', 'Alternador ou bateria'],
    parts: ['Fusíveis', 'Relés', 'Fiação (conforme necessidade)'],
    services: ['Diagnóstico elétrico', 'Localização de curto', 'Substituição de componentes'],
    estimated_hours: 1.5,
  },
  {
    keywords: ['revisão', 'revisão geral', 'preventiva', 'manutenção'],
    causes: ['Manutenção preventiva periódica'],
    parts: ['Óleo do motor', 'Filtro de óleo', 'Filtro de ar', 'Filtro de combustível', 'Velas (conforme km)', 'Fluidos (freio, direção, arrefecimento)'],
    services: ['Revisão completa (óleo, filtros, inspeção)', 'Troca de fluidos', 'Verificação de freios e suspensão'],
    estimated_hours: 2.5,
  },
];

function findDiagnostic(userInput) {
  const text = normalize(userInput);
  if (!text) return null;
  for (const entry of KNOWLEDGE) {
    const match = entry.keywords.some((k) => text.includes(normalize(k)));
    if (match) {
      return {
        causes: entry.causes,
        parts: entry.parts,
        services: entry.services,
        estimated_hours: entry.estimated_hours,
      };
    }
  }
  return null;
}

function getDiagnosticSuggestions(symptom) {
  const found = findDiagnostic(symptom);
  if (found) return found;
  return {
    causes: ['Sintoma genérico: recomendamos inspeção para identificar a causa.'],
    parts: [],
    services: ['Diagnóstico mecânico', 'Inspeção geral'],
    estimated_hours: 1,
  };
}

export { getDiagnosticSuggestions, findDiagnostic, KNOWLEDGE };
