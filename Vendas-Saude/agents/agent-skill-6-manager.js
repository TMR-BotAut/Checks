'use strict';

const { callLLM, parseJSON, PROVIDER } = require('../llm-adapter');
const { search } = require('../web-search-adapter');
const { scan: marketScan } = require('../data/market-signal-scanner');
const { CAMPANHAS_PADRAO } = require('./agent-skill-3');

const SYSTEM_PROMPT = `Você é o Gerente de Vendas da Queiroz Seguros em Teresópolis/RJ.
Analisa mercado, tendências e oportunidades para orientar o corretor Rodrigo.
Seja direto, honesto (inclusive sobre limitações do mercado) e acionável.
Responda APENAS com JSON válido.`;

async function audienceDeep(segmento) {
  if (PROVIDER === 'mock') {
    return {
      modo: 'audience_deep', segmento,
      perfil: `Público ${segmento} em Teresópolis — profissionais de classe média, 30–55 anos, preocupados com custo-benefício`,
      motivacoes: ['Segurança para a família', 'Acesso a especialistas', 'Preço acessível'],
      objecoes: ['Preço alto', 'Sem hospital local', 'Coparticipação desanima'],
      abordagem: 'Enfatizar custo-benefício vs. consultas particulares. Esclarecer rede em Petrópolis.'
    };
  }
  const searchResults = await search(`plano de saúde ${segmento} Teresópolis perfil comprador`, { num: 3 });
  const contexto = searchResults.results.map(r => r.snippet).join('\n');
  const prompt = `Analise o público do segmento "${segmento}" para venda de planos de saúde em Teresópolis/RJ.
Dados de pesquisa: ${contexto || 'sem dados disponíveis'}
Retorne JSON: {"perfil":"...","motivacoes":["..."],"objecoes":["..."],"abordagem":"..."}`;
  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1200 });
    return { modo: 'audience_deep', segmento, ...parseJSON(resp, {}) };
  } catch { return { modo: 'audience_deep', segmento, erro: 'Falha ao analisar público' }; }
}

async function marketIntel(cidade = 'Teresópolis') {
  const scanner = await marketScan(cidade);
  if (PROVIDER === 'mock') {
    return {
      modo: 'market_intel', cidade, scanner,
      analise: 'Modo mock — configure LLM_PROVIDER para análise real',
      oportunidades: [`Produto líder esta semana: ${scanner.recomendacaoLabel} (score ${scanner.scores[0]?.score})`],
      riscos: ['Dados parcialmente estimados — validar com dados reais']
    };
  }
  const top5 = scanner.scores.slice(0, 5).map(s => `${s.label}: score ${s.score} (${s.confianca}) — ${s.gatilho}`).join('\n');
  const prompt = `Analise o mercado de seguros em ${cidade}/RJ. Top 5 produtos por oportunidade esta semana:\n${top5}\nDados adicionais: Selic=${scanner.dadosAPI?.selic}%, USD=R$${scanner.dadosAPI?.cambioUSD}, Chuva=${scanner.dadosAPI?.chuvaMM}mm\nRetorne JSON: {"analise":"análise honesta (2-3 parágrafos)","oportunidades":["..."],"riscos":["..."],"recomendacao":"ação mais importante para esta semana"}`;
  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1500 });
    return { modo: 'market_intel', cidade, scanner, ...parseJSON(resp, {}) };
  } catch { return { modo: 'market_intel', cidade, scanner, erro: 'Falha na análise de mercado' }; }
}

async function campaignBrief(segmento, campanhas) {
  const campsList = campanhas || CAMPANHAS_PADRAO;
  const camp = campsList.find(c => c.segmento === segmento) || campsList[0];
  if (PROVIDER === 'mock') {
    return {
      modo: 'campaign_brief', campanha: camp?.nome || segmento,
      canal: camp?.canal || 'Instagram + WhatsApp',
      mensagem: 'Seu plano de saúde em Teresópolis a partir de R$258/mês. Fale com a Queiroz Seguros!',
      calendario: ['Semana 1: Stories no Instagram', 'Semana 2: WhatsApp ativo para leads', 'Semana 3: Retargeting'],
      meta: '15–20 leads em 30 dias'
    };
  }
  const prompt = `Crie um brief de campanha para ${segmento} da Queiroz Seguros, Teresópolis/RJ.\nCampanha: ${camp?.nome || segmento} | Canal: ${camp?.canal || 'Instagram'}\nRetorne JSON: {"campanha":"...","canal":"...","mensagem":"mensagem principal (max 160 caracteres)","calendario":["ação semana 1","ação semana 2","ação semana 3"],"meta":"meta estimada de leads"}`;
  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1000 });
    return { modo: 'campaign_brief', ...parseJSON(resp, {}) };
  } catch { return { modo: 'campaign_brief', erro: 'Falha ao gerar brief' }; }
}

async function opportunityScan(cidade = 'Teresópolis') {
  const scanner = await marketScan(cidade);
  const hoje = new Date();
  const proxVarredura = new Date(hoje);
  proxVarredura.setDate(proxVarredura.getDate() + 7);

  const oportunidades = scanner.scores.map((s, i) => ({
    produto: s.produto,
    titulo: s.label,
    score: s.score,
    volume: s.volume,
    urgencia: s.score >= 65 ? 'alta' : s.score >= 40 ? 'media' : 'baixa',
    janela: 'próximas 4 semanas',
    acaoRecomendada: s.acaoRecomendada,
    planosIndicados: s.planosIndicados,
    mensagemPronta: s.mensagemPronta,
    metaEstimada: s.metaEstimada,
    confianca: s.confianca,
    confianca_percentual: s.confianca_percentual,
    gatilho: s.gatilho,
    sinais: s.sinais,
    fatores_impulsionadores: s.fatores_impulsionadores,
    perfil_cliente: s.perfil_cliente,
    acoes_recomendadas: s.acoes_recomendadas,
    receita_potencial: s.receita_potencial,
    ticket_medio: s.ticket_medio,
    taxa_conversao: s.taxa_conversao
  }));

  const top = scanner.scores[0];
  const resumo = `${top.label} lidera com score ${top.score} — ${top.gatilho}. ${scanner.crossSellAlerta}`;

  return {
    modo: 'opportunity_scan',
    dataVarredura: hoje.toISOString().slice(0, 10),
    cidade,
    fonte: scanner.fontes,
    confianca: top.confianca,
    resumoExecutivo: resumo,
    recomendacao: scanner.recomendacao,
    recomendacaoLabel: scanner.recomendacaoLabel,
    mensagemCampanha: scanner.mensagemCampanha,
    crossSellAlerta: scanner.crossSellAlerta,
    dadosAPI: scanner.dadosAPI,
    oportunidades,
    oqueNaoFazer: [
      'Não disparar para lista fria sem segmentação por perfil',
      'Não prometer rede em Teresópolis — sem hospital local nos planos de saúde',
      'Não oferecer obstetrícia em planos que não cobrem (Leve Top 400 não cobre)',
      'Não oferecer apenas saúde — use a varredura para cross-sell de outros produtos'
    ],
    proximaVarredura: proxVarredura.toISOString().slice(0, 10)
  };
}

async function fullReport(cidade = 'Teresópolis') {
  const [audience_mei, audience_pf, intel, brief_mei] = await Promise.all([
    audienceDeep('mei'),
    audienceDeep('pessoa_fisica'),
    marketIntel(cidade),
    campaignBrief('pme')
  ]);
  return {
    modo: 'full_report', cidade,
    dataRelatorio: new Date().toISOString().slice(0, 10),
    audienceMEI: audience_mei,
    audiencePF: audience_pf,
    inteligenciaMercado: intel,
    briefCampanha: brief_mei
  };
}

async function executar(modo, opcoes = {}) {
  const { segmento, cidade, campanhas } = opcoes;
  switch (modo) {
    case 'audience_deep':    return audienceDeep(segmento || 'pessoa_fisica');
    case 'market_intel':     return marketIntel(cidade);
    case 'campaign_brief':   return campaignBrief(segmento || 'pme', campanhas);
    case 'full_report':      return fullReport(cidade);
    case 'opportunity_scan': return opportunityScan(cidade);
    default: throw new Error(`Modo desconhecido: ${modo}`);
  }
}

module.exports = { executar, audienceDeep, marketIntel, campaignBrief, opportunityScan, fullReport };
