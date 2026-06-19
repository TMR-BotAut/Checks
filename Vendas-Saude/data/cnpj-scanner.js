'use strict';

require('dotenv').config();

const BRASILIO_TOKEN = process.env.BRASILIO_API_TOKEN || '';

// Estimativa histórica Sebrae/IBGE 2024 para Teresópolis quando sem token
const ESTIMATIVA_MENSAL_TERES = 62;

// CNPJs de exemplo (mock) para desenvolvimento sem token Brasil.IO
const MOCK_EMPRESAS = [
  { cnpj: '12.345.678/0001-90', abertura: '2025-12-15', razao: 'CARLOS ALBERTO SOUZA 09876543210', situacao: 'ATIVA', municipio: 'TERESOPOLIS', uf: 'RJ' },
  { cnpj: '98.765.432/0001-10', abertura: '2025-11-20', razao: 'MARIA DA SILVA COMERCIO ME', situacao: 'ATIVA', municipio: 'TERESOPOLIS', uf: 'RJ' },
  { cnpj: '11.222.333/0001-44', abertura: '2025-11-05', razao: 'JOAO FERREIRA SERVICOS LTDA ME', situacao: 'ATIVA', municipio: 'TERESOPOLIS', uf: 'RJ' },
  { cnpj: '55.666.777/0001-88', abertura: '2025-10-10', razao: 'ANA PAULA LIMA BEAUTY', situacao: 'ATIVA', municipio: 'TERESOPOLIS', uf: 'RJ' },
  { cnpj: '44.555.666/0001-22', abertura: '2025-10-01', razao: 'PEDRO COSTA ELETRICA ME', situacao: 'ATIVA', municipio: 'TERESOPOLIS', uf: 'RJ' },
];

async function buscarMEIsTeresopolis(janelaDias = 30) {
  const hoje = new Date();
  const dataInicio = new Date(hoje);
  dataInicio.setMonth(dataInicio.getMonth() - 6);
  dataInicio.setDate(dataInicio.getDate() - Math.floor(janelaDias / 2));
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + janelaDias);

  if (!BRASILIO_TOKEN) {
    return {
      fonte: 'estimativa',
      confianca: 'media',
      estimativa: true,
      total: ESTIMATIVA_MENSAL_TERES,
      janela: `${dataInicio.toISOString().slice(0, 10)} a ${dataFim.toISOString().slice(0, 10)}`,
      nota: 'Estimativa baseada em média histórica Sebrae/IBGE 2024. Configure BRASILIO_API_TOKEN para dados reais.',
      cnpjs: MOCK_EMPRESAS.map(e => ({ cnpj: e.cnpj, abertura: e.abertura, razao: e.razao, situacao: e.situacao, municipio: e.municipio, uf: e.uf }))
    };
  }

  try {
    const url = 'https://brasil.io/api/dataset/socios-brasil/empresas/data/?municipio=TERESOPOLIS&uf=RJ&format=json';
    const resp = await fetch(url, {
      headers: { Authorization: `Token ${BRASILIO_TOKEN}` }
    });

    if (!resp.ok) throw new Error(`Brasil.IO HTTP ${resp.status}`);
    const data = await resp.json();

    // Natureza jurídica 213-5 = Empresário Individual (MEI)
    const meis = (data.results || []).filter(e => {
      if (!e.data_abertura || !e.natureza_juridica) return false;
      const isMei = e.natureza_juridica.startsWith('213');
      const abertura = new Date(e.data_abertura);
      return isMei && abertura >= dataInicio && abertura <= dataFim;
    });

    return {
      fonte: 'brasil.io',
      confianca: 'alta',
      estimativa: false,
      total: meis.length,
      janela: `${dataInicio.toISOString().slice(0, 10)} a ${dataFim.toISOString().slice(0, 10)}`,
      cnpjs: meis.map(e => ({
        cnpj: e.cnpj,
        abertura: e.data_abertura,
        razao: e.razao_social,
        situacao: e.situacao_cadastral || 'ATIVA',
        municipio: e.municipio || 'TERESOPOLIS',
        uf: e.uf || 'RJ'
      }))
    };
  } catch (err) {
    return {
      fonte: 'estimativa',
      confianca: 'baixa',
      estimativa: true,
      total: ESTIMATIVA_MENSAL_TERES,
      janela: `${dataInicio.toISOString().slice(0, 10)} a ${dataFim.toISOString().slice(0, 10)}`,
      nota: `Erro ao consultar Brasil.IO: ${err.message}. Usando estimativa.`,
      cnpjs: MOCK_EMPRESAS.map(e => ({ cnpj: e.cnpj, abertura: e.abertura, razao: e.razao, situacao: e.situacao, municipio: e.municipio, uf: e.uf }))
    };
  }
}

module.exports = { buscarMEIsTeresopolis, ESTIMATIVA_MENSAL_TERES };
