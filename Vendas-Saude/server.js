'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { orquestrar }         = require('./agents/agent-skill-5-main');
const { executar: gerente }  = require('./agents/agent-skill-6-manager');
const { PLANOS }             = require('./data/teresopolis-planos');
const { PROVIDER }           = require('./llm-adapter');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeoutPromise(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms))
  ]);
}

function handleError(res, err, status = 500) {
  console.error('[ERRO]', err.message);
  res.status(status).json({ erro: err.message });
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// POST /api/lead — análise completa de lead
app.post('/api/lead', async (req, res) => {
  try {
    const { leadData, campanhas } = req.body || {};
    if (!leadData) return res.status(400).json({ erro: 'Corpo da requisição deve conter "leadData"' });

    const resultado = await timeoutPromise(
      orquestrar({ modo: 'novo_lead', leadData, campanhas }),
      25000
    );
    res.json(resultado);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/funil — só funil de contato
app.post('/api/funil', async (req, res) => {
  try {
    const { leadData } = req.body || {};
    if (!leadData) return res.status(400).json({ erro: 'Corpo da requisição deve conter "leadData"' });

    const resultado = await timeoutPromise(
      orquestrar({ modo: 'funil', leadData }),
      15000
    );
    res.json(resultado);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/scan — varredura de oportunidades de mercado
app.get('/api/scan', async (req, res) => {
  try {
    const cidade = req.query.cidade || 'Teresópolis';
    const resultado = await timeoutPromise(
      orquestrar({ modo: 'opportunity_scan', cidade }),
      30000
    );
    res.json(resultado);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/planos — retorna base de planos
app.get('/api/planos', (req, res) => {
  const { segmento } = req.query;
  const lista = segmento ? PLANOS.filter(p => p.segmento === segmento || (segmento === 'mei' && p.segmento === 'pme')) : PLANOS;
  res.json(lista.map(p => ({
    id: p.id,
    nome: p.nome,
    operadora: p.operadora,
    segmento: p.segmento,
    acomodacao: p.acomodacao,
    coparticipacao: p.coparticipacao,
    obstetrica: p.obstetrica,
    alertas: p.alertas,
    rede: p.rede
  })));
});

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: PROVIDER, timestamp: new Date().toISOString() });
});

// Fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏥 Queiroz Seguros Bot — Servidor iniciado`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🤖 LLM Provider: ${PROVIDER}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/lead    — análise de lead`);
  console.log(`  POST /api/funil   — funil de contato`);
  console.log(`  GET  /api/scan    — varredura de mercado`);
  console.log(`  GET  /api/planos  — base de planos`);
  console.log(`  GET  /health      — status\n`);
});
