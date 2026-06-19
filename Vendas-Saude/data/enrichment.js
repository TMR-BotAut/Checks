'use strict';

/**
 * Enriquecimento de leads B2B via fontes 100% públicas (LGPD Art. 7, VI — legítimo interesse B2B):
 *  1. Minha Receita (minhareceita.org) — espelho gratuito dos dados cadastrais da Receita Federal
 *  2. Busca web — perfis públicos em Google Meu Negócio, Instagram, LinkedIn
 *
 * Dados de contato da RF (telefone, e-mail) são informados voluntariamente pela empresa no ato
 * do registro. Sua divulgação é autorizada por lei (Lei 9.249/95 e Portaria RFB 1.863/2018).
 */

require('dotenv').config();

const https = require('https');
const { search } = require('../web-search-adapter');

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpGet(url, timeoutMs = 8000) {
  return new Promise(resolve => {
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'queiroz-seguros-bot/1.0 (B2B prospect)' } }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}

// Limpa CNPJ para apenas dígitos
function cleanCNPJ(cnpj) {
  return String(cnpj || '').replace(/\D/g, '');
}

// ─── Receita Federal via Minha Receita (gratuita, sem chave) ─────────────────
async function fetchReceitaFederal(cnpj) {
  const c = cleanCNPJ(cnpj);
  if (c.length !== 14) return null;

  const data = await httpGet(`https://minhareceita.org/${c}`);
  if (!data || data.status === 'ERROR') return null;

  const telefones = [data.ddd_telefone_1, data.ddd_telefone_2]
    .filter(Boolean)
    .map(t => t.replace(/\s+/g, '').replace(/^(\d{2})(\d+)$/, '($1) $2'));

  return {
    cnpj: c,
    razaoSocial: data.razao_social || '',
    nomeFantasia: data.nome_fantasia || '',
    situacao: data.descricao_situacao_cadastral || 'Ativa',
    dataAbertura: data.data_inicio_atividade || '',
    email: (data.correio_eletronico || '').toLowerCase(),
    telefones,
    endereco: [
      data.logradouro, data.numero, data.complemento,
      data.bairro, data.municipio, data.uf
    ].filter(Boolean).join(', '),
    municipio: data.municipio || '',
    uf: data.uf || '',
    atividadePrincipal: data.cnae_fiscal_descricao || '',
    natureza: data.descricao_natureza_juridica || '',
    porte: data.descricao_porte || '',
    capitalSocial: data.capital_social || 0,
    socios: (data.qsa || []).map(s => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
    fonte: 'receita_federal'
  };
}

// ─── Busca de presença digital pública ───────────────────────────────────────
// Faz busca orgânica por nome + cidade e extrai links de redes sociais públicas.
// Não acessa nenhum dado privado — apenas indexa o que já está público.
const SOCIAL_PATTERNS = [
  { key: 'instagram', regex: /instagram\.com\/([^/"'\s?]+)/i },
  { key: 'facebook',  regex: /facebook\.com\/([^/"'\s?]+)/i },
  { key: 'linkedin',  regex: /linkedin\.com\/(?:company|in)\/([^/"'\s?]+)/i },
  { key: 'whatsapp',  regex: /wa\.me\/(\d+)|whatsapp[^\d]*(\d{10,13})/i },
];

function extractSocials(text) {
  const found = {};
  for (const { key, regex } of SOCIAL_PATTERNS) {
    const m = text.match(regex);
    if (m) found[key] = m[0];
  }
  return found;
}

function extractPhone(text) {
  const phones = [];
  const re = /(\(?\d{2}\)?\s?[\d\s\-]{8,10})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].replace(/\s/g, '');
    if (p.length >= 10 && !phones.includes(p)) phones.push(p);
  }
  return phones[0] || null;
}

async function searchPresencaDigital(nomeFantasia, razaoSocial, municipio) {
  const nome = nomeFantasia || razaoSocial;
  if (!nome) return {};

  try {
    const query = `"${nome}" ${municipio || 'Teresópolis'} site:instagram.com OR site:linkedin.com OR site:facebook.com OR telefone`;
    const results = await search(query, { num: 5 });
    if (!results?.results?.length) return {};

    const allText = results.results.map(r => `${r.title} ${r.snippet} ${r.url}`).join(' ');
    const socials = extractSocials(allText);
    const phoneWeb = extractPhone(allText);

    // Tenta pegar link do Google Meu Negócio
    const gmn = results.results.find(r => r.url?.includes('maps.google') || r.url?.includes('goo.gl/maps'));

    return { ...socials, telefoneWeb: phoneWeb || null, googleMaps: gmn?.url || null, fonteWeb: 'busca_organica' };
  } catch {
    return {};
  }
}

// ─── Enriquecimento completo de um CNPJ ──────────────────────────────────────
async function enriquecerCNPJ(cnpj, opcoes = {}) {
  const { buscarDigital = true } = opcoes;

  const rf = await fetchReceitaFederal(cnpj);
  if (!rf) {
    return { cnpj: cleanCNPJ(cnpj), erro: 'CNPJ não encontrado ou inativo na Receita Federal' };
  }

  let digital = {};
  if (buscarDigital) {
    digital = await searchPresencaDigital(rf.nomeFantasia, rf.razaoSocial, rf.municipio);
  }

  // Consolida contatos: RF tem prioridade, web complementa
  const telefonesFinais = [
    ...rf.telefones,
    ...(digital.telefoneWeb && !rf.telefones.includes(digital.telefoneWeb) ? [digital.telefoneWeb] : [])
  ].filter(Boolean);

  return {
    ...rf,
    telefones: telefonesFinais,
    telefoneContato: telefonesFinais[0] || null,
    emailContato: rf.email || null,
    presencaDigital: {
      instagram:  digital.instagram   || null,
      facebook:   digital.facebook    || null,
      linkedin:   digital.linkedin    || null,
      whatsapp:   digital.whatsapp    || null,
      googleMaps: digital.googleMaps  || null,
    },
    fontes: ['receita_federal', ...(buscarDigital ? ['busca_organica'] : [])],
    enriquecidoEm: new Date().toISOString().slice(0, 19)
  };
}

// ─── Enriquecimento em lote (com rate-limit gentil) ──────────────────────────
async function enriquecerLote(cnpjs, opcoes = {}) {
  const { buscarDigital = true, delayMs = 1200 } = opcoes;
  const resultados = [];

  for (const cnpj of cnpjs) {
    const r = await enriquecerCNPJ(cnpj, { buscarDigital });
    resultados.push(r);
    if (delayMs > 0 && cnpjs.indexOf(cnpj) < cnpjs.length - 1) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  return resultados;
}

module.exports = { enriquecerCNPJ, enriquecerLote, fetchReceitaFederal };
