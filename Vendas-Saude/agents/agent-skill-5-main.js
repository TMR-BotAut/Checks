'use strict';

const { analisarPublico }  = require('./agent-skill-1');
const { gerarFunil }       = require('./agent-skill-2');
const { consultar, gerir } = require('./agent-skill-3');
const { analisarMercado }  = require('./agent-skill-4');
const { executar: gerente } = require('./agent-skill-6-manager');

async function orquestrar(input = {}) {
  const { modo, leadData = {}, campanhas, cidade } = input;
  const erros = [];

  // ─── novo_lead ────────────────────────────────────────────────────────────
  if (modo === 'novo_lead') {
    if (!leadData.nome) erros.push('Campo "nome" não informado');

    let perfil, funil, campanha, mercado;

    try {
      perfil = await analisarPublico(leadData);
    } catch (e) {
      erros.push(`skill-1 falhou: ${e.message}`);
      perfil = { segmento: 'pessoa_fisica', prioridade: 'media', elegibilidade: { elegivel: true, motivo: '' }, faixaPrecoReal: null, alertas: [], observacoes: '' };
    }

    [funil, campanha, mercado] = await Promise.allSettled([
      gerarFunil(leadData, perfil),
      consultar(perfil, campanhas),
      analisarMercado(leadData, perfil)
    ]).then(results => results.map((r, i) => {
      if (r.status === 'rejected') { erros.push(`skill-${i + 2} falhou: ${r.reason?.message}`); return {}; }
      return r.value;
    }));

    const resumoFinal = [
      `Lead ${leadData.nome || 'sem nome'} — ${perfil.segmento?.toUpperCase()} — Prioridade ${perfil.prioridade?.toUpperCase()}`,
      perfil.alertas?.length ? `Alertas: ${perfil.alertas.join('; ')}` : '',
      funil?.resumo || '',
      mercado?.resumo || ''
    ].filter(Boolean).join(' | ');

    return { modo, perfil, funil, campanha, mercado, resumoFinal, ...(erros.length ? { erros } : {}) };
  }

  // ─── funil ────────────────────────────────────────────────────────────────
  if (modo === 'funil') {
    const perfil = await analisarPublico(leadData).catch(e => {
      erros.push(e.message);
      return { segmento: 'pessoa_fisica', prioridade: 'media', alertas: [] };
    });
    const funil = await gerarFunil(leadData, perfil).catch(e => { erros.push(e.message); return {}; });
    return { modo, perfil, funil, ...(erros.length ? { erros } : {}) };
  }

  // ─── analise_mercado ──────────────────────────────────────────────────────
  if (modo === 'analise_mercado') {
    const perfil = await analisarPublico(leadData).catch(e => {
      erros.push(e.message);
      return { segmento: leadData.segmento || 'pessoa_fisica', prioridade: 'media', alertas: [] };
    });
    const mercado = await analisarMercado(leadData, perfil).catch(e => { erros.push(e.message); return {}; });
    return { modo, perfil, mercado, ...(erros.length ? { erros } : {}) };
  }

  // ─── gerir_campanhas ──────────────────────────────────────────────────────
  if (modo === 'gerir_campanhas') {
    const resultado = await gerir(campanhas).catch(e => { erros.push(e.message); return {}; });
    return { modo, gestao: resultado, ...(erros.length ? { erros } : {}) };
  }

  // ─── opportunity_scan ─────────────────────────────────────────────────────
  if (modo === 'opportunity_scan') {
    return gerente('opportunity_scan', { cidade: cidade || 'Teresópolis' });
  }

  throw new Error(`Modo desconhecido: ${modo}. Modos válidos: novo_lead, funil, analise_mercado, gerir_campanhas, opportunity_scan`);
}

module.exports = { orquestrar };
