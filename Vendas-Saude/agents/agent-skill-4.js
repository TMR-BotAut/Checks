'use strict';

const { callLLM, parseJSON, PROVIDER } = require('../llm-adapter');
const { filtrarPorSegmento, getPrecoParaIdade } = require('../data/teresopolis-planos');

const SYSTEM_PROMPT = `Você é analista de mercado de saúde suplementar para a Queiroz Seguros em Teresópolis/RJ.
Recebe dados reais de planos e preços e gera recomendações fundamentadas.
NUNCA invente preços — use apenas os dados fornecidos.
Contexto: nenhum hospital em Teresópolis, internação em Petrópolis ou RJ.
Responda APENAS com JSON válido.`;

function recomendar_mock(segmento, planos) {
  const top = planos.slice(0, 3);
  return {
    planosRecomendados: top.map(p => ({
      nome: p.plano,
      operadora: p.operadora,
      valor: p.valor,
      motivo: p.coparticipacao ? 'Menor custo mensal com coparticipação' : 'Sem coparticipação — previsibilidade financeira',
      acomodacao: p.acomodacao,
      coparticipacao: p.coparticipacao,
      obstetrica: p.obstetrica,
      alertas: p.alertas
    })),
    alertas: ['Nenhum plano tem hospital em Teresópolis — internação em Petrópolis ou RJ'],
    resumo: `Para o segmento ${segmento}, os planos mais indicados são: ${top.map(p => p.plano).join(', ')}.`
  };
}

async function analisarMercado(leadData, perfil) {
  const { idade, orcamento } = leadData;
  const { segmento } = perfil;
  const idadeNum = parseInt(idade) || 35;
  const orcamentoNum = parseFloat(orcamento) || null;

  const planosFiltrados = filtrarPorSegmento(segmento);
  const planosComPreco = planosFiltrados.map(p => ({
    plano: p.nome,
    operadora: p.operadora,
    id: p.id,
    valor: getPrecoParaIdade(p, idadeNum),
    acomodacao: p.acomodacao,
    coparticipacao: p.coparticipacao,
    obstetrica: p.obstetrica,
    alertas: p.alertas
  })).filter(p => p.valor !== null).sort((a, b) => a.valor - b.valor);

  if (PROVIDER === 'mock') return recomendar_mock(segmento, planosComPreco);

  const prompt = `Lead: ${idadeNum} anos, segmento ${segmento}, orçamento ${orcamentoNum ? `R$${orcamentoNum}` : 'não informado'}.
Planos disponíveis com preços reais para ${idadeNum} anos:
${JSON.stringify(planosComPreco.map(p => ({
  nome: p.plano, operadora: p.operadora, valor: `R$${p.valor.toFixed(2)}`,
  acomodacao: p.acomodacao, coparticipacao: p.coparticipacao, obstetrica: p.obstetrica
})), null, 2)}
${orcamentoNum ? `Orçamento máximo: R$${orcamentoNum}` : ''}

Retorne JSON:
{
  "planosRecomendados": [{"nome":"...","operadora":"...","valor":0.00,"motivo":"...","acomodacao":"...","coparticipacao":true,"obstetrica":false}],
  "alertas": ["..."],
  "resumo": "..."
}
Inclua no máximo 3 planos. Priorize os que cabem no orçamento.`;

  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1500 });
    const parsed = parseJSON(resp, recomendar_mock(segmento, planosComPreco));
    return parsed.planosRecomendados ? parsed : recomendar_mock(segmento, planosComPreco);
  } catch {
    return recomendar_mock(segmento, planosComPreco);
  }
}

module.exports = { analisarMercado };
