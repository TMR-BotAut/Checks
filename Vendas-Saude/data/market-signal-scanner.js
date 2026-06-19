'use strict';

require('dotenv').config();

const { buscarMEIsTeresopolis } = require('./cnpj-scanner');
const { search } = require('../web-search-adapter');

// ─── Sazonalidade fixa ────────────────────────────────────────────────────────
const SAZONALIDADE = {
  1:  { mei: 10, pf: 10, adesao: 10, motivo: 'Início de ano — planejamento de benefícios' },
  2:  { mei: 0,  pf: 15, adesao: 5,  motivo: 'Reajuste ANS anunciado — PF busca alternativa' },
  3:  { mei: 0,  pf: 15, adesao: 5,  motivo: 'Reajuste ANS em vigor — PF busca alternativa' },
  4:  { mei: 0,  pf: 0,  adesao: 0,  motivo: null },
  5:  { mei: 0,  pf: 0,  adesao: 0,  motivo: null },
  6:  { mei: 5,  pf: 0,  adesao: 0,  motivo: 'Fechamento semestral de CNPJs — MEI em foco' },
  7:  { mei: 5,  pf: 0,  adesao: 0,  motivo: 'Fechamento semestral de CNPJs — MEI em foco' },
  8:  { mei: 0,  pf: 0,  adesao: 0,  motivo: null },
  9:  { mei: 0,  pf: 0,  adesao: 0,  motivo: null },
  10: { mei: 10, pf: 10, adesao: 10, motivo: 'Planejamento de benefícios para o próximo ano' },
  11: { mei: 10, pf: 10, adesao: 10, motivo: 'Planejamento de benefícios para o próximo ano' },
  12: { mei: 0,  pf: 0,  adesao: 0,  motivo: null }
};

// ─── Score de busca orgânica ──────────────────────────────────────────────────
async function sinalizadorBuscaOrganica() {
  try {
    const resultado = await search('plano de saúde Teresópolis', { num: 3 });
    const temResultados = resultado.results && resultado.results.length > 0;
    const score = temResultados ? 15 : 0;
    return {
      score,
      sinal: temResultados ? 'Busca orgânica por "plano de saúde Teresópolis" ativa' : 'Sem sinal de busca orgânica',
      fonte: resultado.provider
    };
  } catch {
    return { score: 0, sinal: 'Busca web indisponível', fonte: 'indisponível' };
  }
}

// ─── Segmento MEI ─────────────────────────────────────────────────────────────
async function avaliarMEI() {
  const dadosCNPJ = await buscarMEIsTeresopolis(30);
  const volume = dadosCNPJ.total || 0;

  // Score base: até 50 pontos pelo volume de MEIs elegíveis
  let score = Math.min(50, Math.round((volume / 80) * 50));

  const sinais = [];
  if (volume > 0) sinais.push(`${volume} MEIs completando 6 meses em Teresópolis (elegibilidade PME)`);
  if (dadosCNPJ.estimativa) sinais.push('Dado estimado — configure BRASILIO_API_TOKEN para precisão real');

  return {
    score,
    confianca: dadosCNPJ.confianca,
    sinais,
    dadosBrutos: dadosCNPJ,
    volume: `~${volume} MEIs`
  };
}

// ─── Segmento PF — gap de cobertura ANS ──────────────────────────────────────
async function avaliarPF() {
  // ANS open data: beneficiários por município
  // Código IBGE Teresópolis: 3305802
  // Taxa de cobertura RJ: ~25%. Se Teresópolis estiver abaixo, gap existe.
  // Dados fixos baseados no último relatório ANS 2024-Q3 disponível publicamente.
  const populacaoTeresopolis = 175000; // IBGE 2024 estimado
  const beneficiariosANS = 32500;      // estimativa ANS 2024-Q3 (sem API em tempo real)
  const taxaCobertura = (beneficiariosANS / populacaoTeresopolis) * 100;
  const mediaEstadualRJ = 25;
  const gap = mediaEstadualRJ - taxaCobertura;

  let score = 0;
  const sinais = [];

  if (gap > 0) {
    score += Math.min(30, Math.round(gap * 3));
    sinais.push(`Cobertura em Teresópolis: ~${taxaCobertura.toFixed(1)}% vs média RJ de ${mediaEstadualRJ}% — gap de ${gap.toFixed(1)} p.p.`);
  } else {
    sinais.push(`Cobertura em Teresópolis: ~${taxaCobertura.toFixed(1)}% — próxima da média estadual`);
  }

  sinais.push('Dado estimado ANS 2024-Q3 — população sem plano empresarial é mercado PF');

  return {
    score,
    confianca: 'baixa',
    sinais,
    taxaCobertura: taxaCobertura.toFixed(1),
    gapPercentual: gap.toFixed(1),
    volume: `~${Math.round(populacaoTeresopolis * (gap / 100)).toLocaleString('pt-BR')} pessoas sem plano`
  };
}

// ─── Segmento Adesão ──────────────────────────────────────────────────────────
async function avaliarAdesao() {
  // Sem API pública para profissionais por município.
  // Estimativa baseada em lista ANASPL + proporção IBGE Censo de Profissões.
  const populacaoTeresopolis = 175000;
  const propProfissionalRJ = 0.042; // ~4,2% da pop economicamente ativa em profissões regulamentadas
  const estimativaProfissionais = Math.round(populacaoTeresopolis * propProfissionalRJ);
  const taxaAdesaoAtual = 0.15; // estimativa: 15% já têm plano adesão
  const mercadoPotencial = Math.round(estimativaProfissionais * (1 - taxaAdesaoAtual));

  return {
    score: 25,
    confianca: 'baixa',
    sinais: [
      `~${estimativaProfissionais} profissionais elegíveis ANASPL estimados em Teresópolis`,
      `~${mercadoPotencial} ainda sem plano adesão (estimativa por proporção IBGE)`,
      'Sem API pública de profissionais por município — dado estimado'
    ],
    volume: `~${mercadoPotencial} profissionais`
  };
}

// ─── Scanner principal ────────────────────────────────────────────────────────
async function scan(cidade = 'Teresópolis') {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const sazonal = SAZONALIDADE[mes] || { mei: 0, pf: 0, adesao: 0, motivo: null };

  const [mei, pf, adesao, buscaOrganica] = await Promise.all([
    avaliarMEI(),
    avaliarPF(),
    avaliarAdesao(),
    sinalizadorBuscaOrganica()
  ]);

  // Aplicar sazonalidade e sinal de busca orgânica
  const scoreMEI    = Math.min(100, mei.score    + sazonal.mei    + buscaOrganica.score);
  const scorePF     = Math.min(100, pf.score     + sazonal.pf     + buscaOrganica.score);
  const scoreAdesao = Math.min(100, adesao.score + sazonal.adesao + buscaOrganica.score);

  const sinaisMEI    = [...mei.sinais];
  const sinaisPF     = [...pf.sinais];
  const sinaisAdesao = [...adesao.sinais];

  if (sazonal.motivo) {
    sinaisMEI.push(`Sazonalidade: ${sazonal.motivo}`);
    sinaisPF.push(`Sazonalidade: ${sazonal.motivo}`);
    sinaisAdesao.push(`Sazonalidade: ${sazonal.motivo}`);
  }
  if (buscaOrganica.score > 0) {
    sinaisMEI.push(buscaOrganica.sinal);
    sinaisPF.push(buscaOrganica.sinal);
    sinaisAdesao.push(buscaOrganica.sinal);
  }

  const scores = {
    mei:    { score: scoreMEI,    confianca: mei.confianca,    sinais: sinaisMEI,    volume: mei.volume },
    pf:     { score: scorePF,     confianca: pf.confianca,     sinais: sinaisPF,     volume: pf.volume },
    adesao: { score: scoreAdesao, confianca: adesao.confianca, sinais: sinaisAdesao, volume: adesao.volume }
  };

  // Determinar vencedor
  const ranking = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const vencedor = ranking[0][0];
  const vencedorLabel = { mei: 'MEI/PME', pf: 'Pessoa Física', adesao: 'Adesão ANASPL' }[vencedor];

  // Justificativa
  const justificativas = [];
  if (scoreMEI >= scorePF && scoreMEI >= scoreAdesao) {
    justificativas.push(`MEI tem maior volume verificável (${mei.volume}) — prioridade alta.`);
    if (pf.score > 30) justificativas.push('PF tem sinal de gap de cobertura mas confiança baixa.');
  } else if (scorePF >= scoreMEI && scorePF >= scoreAdesao) {
    justificativas.push(`PF tem gap de cobertura de ${pf.gapPercentual}% abaixo da média estadual.`);
    if (scoreMEI > 30) justificativas.push('MEI tem sinal moderado — segunda prioridade.');
  } else {
    justificativas.push('Adesão lidera esta semana — oportunidade em profissionais elegíveis ANASPL.');
  }

  // Próxima varredura: 7 dias
  const proxVarredura = new Date(hoje);
  proxVarredura.setDate(proxVarredura.getDate() + 7);

  return {
    dataVarredura: hoje.toISOString().slice(0, 10),
    cidade,
    scores,
    vencedor,
    vencedorLabel,
    justificativa: justificativas.join(' '),
    fontes: ['brasil.io', 'ans.gov.br (estimativa 2024-Q3)', buscaOrganica.fonte].filter(Boolean),
    proximaVarredura: proxVarredura.toISOString().slice(0, 10)
  };
}

module.exports = { scan, avaliarMEI, avaliarPF, avaliarAdesao };
