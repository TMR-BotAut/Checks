'use strict';

const { callLLM, parseJSON, PROVIDER } = require('../llm-adapter');
const {
  calcularFaixaPreco,
  verificarElegibilidadeAdesao,
  filtrarPorSegmento,
  getPrecoParaIdade
} = require('../data/teresopolis-planos');

const SYSTEM_PROMPT = `Você é um especialista em planos de saúde para a corretora Queiroz Seguros em Teresópolis/RJ.
Analise o perfil do lead e retorne um JSON válido com a estrutura solicitada.
IMPORTANTE: Responda APENAS com JSON, sem texto antes ou depois.
Contexto local: Nenhum plano tem hospital em Teresópolis — internação em Petrópolis ou RJ.`;

async function analisarPublico(leadData) {
  const { nome, idade, profissao, dependentes, orcamento, temMEI, anosEmpresa, mesesEmpresa, mensagem, origem } = leadData;

  // ─── Classificação de segmento (lógica determinística, não depende de LLM) ──
  let segmento = 'pessoa_fisica';
  let elegivel = true;
  let motivoElegibilidade = 'Elegível como pessoa física';
  const alertas = [];

  const totalMeses = (anosEmpresa || 0) * 12 + (mesesEmpresa || 0);

  if (temMEI) {
    if (totalMeses < 6) {
      segmento = 'pessoa_fisica';
      alertas.push(`CNPJ com ${totalMeses} meses — aguardar ${6 - totalMeses} meses para elegibilidade PME`);
      motivoElegibilidade = `MEI com ${totalMeses} meses — sem elegibilidade PME ainda`;
    } else {
      segmento = 'pme';
      motivoElegibilidade = `MEI com ${totalMeses} meses — elegível para plano PME`;
    }
  } else if (profissao && verificarElegibilidadeAdesao(profissao)) {
    segmento = 'adesao';
    motivoElegibilidade = `Profissão "${profissao}" elegível para Adesão ANASPL`;
  }

  // ─── Faixa de preço real ──────────────────────────────────────────────────
  const idadeNum = parseInt(idade) || 35;
  const orcamentoNum = parseFloat(orcamento) || null;
  const faixaPreco = calcularFaixaPreco(segmento, idadeNum, orcamentoNum);

  // ─── Alertas automáticos ──────────────────────────────────────────────────
  alertas.push('Nenhum hospital em Teresópolis — internação em Petrópolis ou RJ');

  if (segmento === 'pessoa_fisica') {
    alertas.push('Leve Top 400 (PF) não cobre obstetrícia');
  }
  if (faixaPreco && faixaPreco.alertaOrcamento) {
    alertas.push(faixaPreco.alertaOrcamento);
  }
  if (dependentes > 0) {
    alertas.push(`${dependentes} dependente(s) — calcular inclusão separadamente`);
  }

  // ─── Prioridade ──────────────────────────────────────────────────────────
  let prioridade = 'media';
  if (orcamentoNum && faixaPreco && faixaPreco.opcoesDentroDoOrcamento.length > 0) {
    prioridade = 'alta';
  } else if (!orcamentoNum && mensagem) {
    prioridade = 'alta';
  } else if (segmento === 'pme') {
    prioridade = 'alta';
  }

  // ─── Enriquecer com LLM (observações qualitativas) ───────────────────────
  let observacoes = '';

  if (PROVIDER !== 'mock') {
    const planosTexto = faixaPreco
      ? faixaPreco.todosPlanos.slice(0, 3).map(p => `${p.plano} R$${p.valor.toFixed(2)}`).join(', ')
      : 'sem dados de plano';

    const prompt = `Analise este lead para a corretora Queiroz Seguros em Teresópolis/RJ:
Nome: ${nome || 'não informado'}
Idade: ${idadeNum} anos
Profissão: ${profissao || 'não informada'}
Dependentes: ${dependentes || 0}
Orçamento: ${orcamentoNum ? `R$${orcamentoNum}` : 'não informado'}
Segmento classificado: ${segmento}
Planos dentro do orçamento: ${planosTexto}
Mensagem original: "${mensagem || ''}"

Retorne JSON: {"observacoes": "2-3 frases sobre este lead e abordagem recomendada"}`;

    try {
      const resp = await callLLM(SYSTEM_PROMPT, prompt);
      const parsed = parseJSON(resp, {});
      observacoes = parsed.observacoes || '';
    } catch {
      observacoes = '';
    }
  }

  return {
    segmento,
    prioridade,
    elegibilidade: { elegivel, motivo: motivoElegibilidade },
    faixaPrecoReal: faixaPreco,
    alertas,
    observacoes
  };
}

module.exports = { analisarPublico };
