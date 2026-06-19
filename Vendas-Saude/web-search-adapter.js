'use strict';

require('dotenv').config();

const PROVIDER = process.env.SEARCH_PROVIDER || 'mock';

async function search(query, options = {}) {
  const { num = 5 } = options;

  if (PROVIDER === 'mock') {
    return {
      provider: 'mock',
      query,
      results: [
        { title: 'Resultado simulado 1', snippet: `Informações sobre: ${query}`, url: 'https://exemplo.com/1' },
        { title: 'Resultado simulado 2', snippet: `Dados relevantes para: ${query}`, url: 'https://exemplo.com/2' }
      ]
    };
  }

  if (PROVIDER === 'serpapi') {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${num}&hl=pt&gl=br&api_key=${process.env.SERPAPI_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return {
      provider: 'serpapi',
      query,
      results: (data.organic_results || []).slice(0, num).map(r => ({
        title: r.title, snippet: r.snippet, url: r.link
      }))
    };
  }

  if (PROVIDER === 'tavily') {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: num, search_depth: 'basic' })
    });
    const data = await res.json();
    return {
      provider: 'tavily',
      query,
      results: (data.results || []).slice(0, num).map(r => ({
        title: r.title, snippet: r.content, url: r.url
      }))
    };
  }

  if (PROVIDER === 'nimble') {
    const res = await fetch('https://api.webit.live/api/v1/realtime/serp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(process.env.NIMBLE_API_KEY + ':').toString('base64')}` },
      body: JSON.stringify({ query, search_engine: 'google_search', num_of_pages: 1, parse: true, country: 'BR', locale: 'pt-BR' })
    });
    const data = await res.json();
    const items = data.parsing?.entities?.OrganicResult || [];
    return {
      provider: 'nimble',
      query,
      results: items.slice(0, num).map(r => ({ title: r.title, snippet: r.description, url: r.url }))
    };
  }

  throw new Error(`SEARCH_PROVIDER desconhecido: ${PROVIDER}`);
}

module.exports = { search };
