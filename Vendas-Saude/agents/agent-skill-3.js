'use strict';

const { callLLM, parseJSON, PROVIDER } = require('../llm-adapter');

const SYSTEM_PROMPT = `Você é gestor de campanhas de marketing para a corretora Queiroz Seguros, Teresópolis/RJ.
Analise campanhas e perfis de lead para identificar a melhor ação comercial.
Responda APENAS com JSON válido.`;

const CAMPANHAS_PADRAO = [
  { id: 'mei_protegido', nome: 'MEI Protegido', segmento: 'pme', canal: 'Instagram + WhatsApp', status: 'ativa' },
  { id: 'pf_teresopolis', nome: 'PF Teresópolis', segmento: 'pessoa_fisica', canal: 'Instagram', status: 'ativa' },
  { id: 'adesao_profissional', nome: 'Adesão Profissional ANASPL', segmento: 'adesao', canal: 'LinkedIn + WhatsApp', status: 'ativa' }
];

async function consultar(perfil, campanhas) {
  const campsList = campanhas || CAMPANHAS_PADRAO;
  const compativel = campsList.find(c => c.segmento === perfil.segmento) || campsList[0];

  if (PROVIDER === 'mock') {
    return {
      campanhaCompativel: compativel?.nome || 'Campanha Geral',
      acaoRecomendada: `Direcionar lead para campanha "${compativel?.nome}" via ${compativel?.canal}`,
      mensagemCorretor: `Lead no segmento ${perfil.segmento}. Use a campanha "${compativel?.nome}" como gancho inicial.`
    };
  }

  const prompt = `Perfil do lead: segmento=${perfil.segmento}, prioridade=${perfil.prioridade}
Campanhas ativas: ${JSON.stringify(campsList.map(c => ({ nome: c.nome, segmento: c.segmento, canal: c.canal })))}

Retorne JSON: {"campanhaCompativel": "...", "acaoRecomendada": "...", "mensagemCorretor": "..."}`;

  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 800 });
    return parseJSON(resp, { campanhaCompativel: compativel?.nome, acaoRecomendada: '', mensagemCorretor: '' });
  } catch {
    return { campanhaCompativel: compativel?.nome || '', acaoRecomendada: '', mensagemCorretor: '' };
  }
}

async function gerir(campanhas) {
  const campsList = campanhas || CAMPANHAS_PADRAO;

  if (PROVIDER === 'mock') {
    return {
      analise: 'Modo mock — análise simulada',
      sugestoes: ['Intensificar campanha MEI Protegido em Junho/Julho', 'Reativar leads inativos do mês anterior'],
      campanhas: campsList.map(c => ({ ...c, sugestao: 'Manter estratégia atual' }))
    };
  }

  const prompt = `Analise as campanhas ativas da Queiroz Seguros Teresópolis:
${JSON.stringify(campsList, null, 2)}

Retorne JSON: {"analise": "...", "sugestoes": ["..."], "campanhas": [{"nome": "...", "sugestao": "..."}]}`;

  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1200 });
    return parseJSON(resp, { analise: '', sugestoes: [], campanhas: [] });
  } catch {
    return { analise: '', sugestoes: [], campanhas: [] };
  }
}

module.exports = { consultar, gerir, CAMPANHAS_PADRAO };
