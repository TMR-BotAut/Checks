'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');

const { orquestrar }         = require('./agents/agent-skill-5-main');
const { executar: gerente }  = require('./agents/agent-skill-6-manager');
const { PLANOS }             = require('./data/teresopolis-planos');
const { PROVIDER }           = require('./llm-adapter');

const app  = express();
const PORT = process.env.PORT || 3000;

const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_OWNER = process.env.GH_OWNER || 'TMR-BotAut';
const GH_REPO  = process.env.GH_REPO  || 'Checks';
const GH_PR    = process.env.GH_PR    || '1';

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

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'queiroz-seguros-bot',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

app.post('/api/lead', async (req, res) => {
  try {
    const { leadData, campanhas } = req.body || {};
    if (!leadData) return res.status(400).json({ erro: 'Campo "leadData" obrigatório' });
    const resultado = await timeoutPromise(orquestrar({ modo: 'novo_lead', leadData, campanhas }), 25000);
    res.json(resultado);
  } catch (err) { handleError(res, err); }
});

app.post('/api/funil', async (req, res) => {
  try {
    const { leadData } = req.body || {};
    if (!leadData) return res.status(400).json({ erro: 'Campo "leadData" obrigatório' });
    const resultado = await timeoutPromise(orquestrar({ modo: 'funil', leadData }), 15000);
    res.json(resultado);
  } catch (err) { handleError(res, err); }
});

app.get('/api/scan', async (req, res) => {
  try {
    const cidade = req.query.cidade || 'Teresópolis';
    const resultado = await timeoutPromise(orquestrar({ modo: 'opportunity_scan', cidade }), 30000);
    res.json(resultado);
  } catch (err) { handleError(res, err); }
});

app.get('/api/planos', (req, res) => {
  const { segmento } = req.query;
  const lista = segmento ? PLANOS.filter(p => p.segmento === segmento) : PLANOS;
  res.json(lista.map(p => ({
    id: p.id, nome: p.nome, operadora: p.operadora, segmento: p.segmento,
    acomodacao: p.acomodacao, coparticipacao: p.coparticipacao, obstetrica: p.obstetrica,
    alertas: p.alertas, rede: p.rede, precos: p.precos
  })));
});

// ── GitHub PR ──────────────────────────────────────────────────────────────────

app.get('/api/pr', async (req, res) => {
  try {
    const pr = req.query.pr || GH_PR;
    const r = await ghRequest('GET', `/repos/${GH_OWNER}/${GH_REPO}/pulls/${pr}`);
    if (r.status !== 200) return res.status(r.status).json({ erro: r.body.message || 'PR não encontrado' });
    const { number, title, state, merged, mergeable, mergeable_state, html_url, head, base, body: prBody, created_at, updated_at } = r.body;
    res.json({ number, title, state, merged, mergeable, mergeable_state, url: html_url, head: head?.ref, base: base?.ref, body: prBody, created_at, updated_at });
  } catch (err) { handleError(res, err); }
});

app.post('/api/pr/merge', async (req, res) => {
  try {
    if (!GH_TOKEN) return res.status(401).json({ erro: 'GITHUB_TOKEN não configurado no .env' });
    const pr = req.body?.pr || GH_PR;
    const r = await ghRequest('PUT', `/repos/${GH_OWNER}/${GH_REPO}/pulls/${pr}/merge`, {
      commit_title: req.body?.titulo || `Merge PR #${pr} — Queiroz Seguros Bot`,
      merge_method: 'squash'
    });
    if (r.status === 200) return res.json({ ok: true, mensagem: 'PR mergeado com sucesso!' });
    res.status(r.status).json({ erro: r.body.message || 'Falha ao mergear PR' });
  } catch (err) { handleError(res, err); }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: PROVIDER,
    github: GH_TOKEN ? 'configurado' : 'sem token (somente leitura)',
    timestamp: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏥 Queiroz Seguros Bot — Servidor iniciado`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🤖 LLM: ${PROVIDER} | GitHub PR: ${GH_OWNER}/${GH_REPO}#${GH_PR}\n`);
});
