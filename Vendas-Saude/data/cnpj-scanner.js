'use strict';

require('dotenv').config();

const BRASILIO_TOKEN = process.env.BRASILIO_API_TOKEN || '';

// Estimativa histórica Sebrae/IBGE 2024 para Teresópolis quando sem token
const ESTIMATIVA_MENSAL_TERES = 62;

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
      nota: 'Estimativa baseada em média histórica Sebrae/IBGE 2024. Configure BRASILIO_API_TOKEN para dados reais.'
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
      cnpjs: meis.map(e => ({ cnpj: e.cnpj, abertura: e.data_abertura, razao: e.razao_social }))
    };
  } catch (err) {
    return {
      fonte: 'estimativa',
      confianca: 'baixa',
      estimativa: true,
      total: ESTIMATIVA_MENSAL_TERES,
      janela: `${dataInicio.toISOString().slice(0, 10)} a ${dataFim.toISOString().slice(0, 10)}`,
      nota: `Erro ao consultar Brasil.IO: ${err.message}. Usando estimativa.`
    };
  }
}

module.exports = { buscarMEIsTeresopolis, ESTIMATIVA_MENSAL_TERES };
