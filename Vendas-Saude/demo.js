'use strict';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock';
process.env.SEARCH_PROVIDER = process.env.SEARCH_PROVIDER || 'mock';

const { orquestrar } = require('./agents/agent-skill-5-main');

async function demo() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  DEMO — Queiroz Seguros Bot (modo mock, sem API key)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ─── Demo 1: Lead MEI ─────────────────────────────────────────────────────
  console.log('📋 CASO 1: Lead MEI com 8 meses de empresa\n');
  const r1 = await orquestrar({
    modo: 'novo_lead',
    leadData: {
      nome: 'João Ferreira',
      idade: 42,
      profissao: 'eletricista',
      dependentes: 1,
      orcamento: 500,
      temMEI: true,
      mesesEmpresa: 8,
      mensagem: 'Tenho MEI há 8 meses. Quero plano pra mim e minha esposa.'
    }
  });

  console.log('Segmento:', r1.perfil.segmento);
  console.log('Prioridade:', r1.perfil.prioridade);
  console.log('Elegibilidade:', r1.perfil.elegibilidade.motivo);
  if (r1.perfil.faixaPrecoReal) {
    console.log('Menor preço:', r1.perfil.faixaPrecoReal.menorPreco.plano, 'R$' + r1.perfil.faixaPrecoReal.menorPreco.valor.toFixed(2));
    console.log('Opções no orçamento:', r1.perfil.faixaPrecoReal.opcoesDentroDoOrcamento.length);
  }
  console.log('Alertas:', r1.perfil.alertas);
  if (r1.funil?.etapas) {
    console.log('\n📅 Funil:');
    r1.funil.etapas.forEach(e => console.log(`  Etapa ${e.etapa} (${e.timing}) — ${e.canal}: ${e.objetivo}`));
  }

  // ─── Demo 2: Lead PF ──────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('📋 CASO 2: Lead Pessoa Física\n');
  const r2 = await orquestrar({
    modo: 'novo_lead',
    leadData: { nome: 'Ana Costa', idade: 29, profissao: 'professora', dependentes: 0, orcamento: 300, temMEI: false, mensagem: 'Preciso de plano individual barato' }
  });

  console.log('Segmento:', r2.perfil.segmento);
  if (r2.perfil.faixaPrecoReal) {
    console.log('Menor preço:', r2.perfil.faixaPrecoReal.menorPreco.plano, 'R$' + r2.perfil.faixaPrecoReal.menorPreco.valor.toFixed(2));
    if (r2.perfil.faixaPrecoReal.alertaOrcamento) console.log('⚠️', r2.perfil.faixaPrecoReal.alertaOrcamento);
  }

  // ─── Demo 3: Varredura de mercado ─────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('📊 CASO 3: Varredura de oportunidades de mercado\n');
  const r3 = await orquestrar({ modo: 'opportunity_scan', cidade: 'Teresópolis' });

  console.log('Resumo executivo:', r3.resumoExecutivo);
  console.log('\nOportunidades por score:');
  (r3.oportunidades || []).forEach(o => {
    console.log(`  [${o.score}] ${o.titulo} — ${o.volume} — ${o.urgencia}`);
  });
  console.log('\nPróxima varredura:', r3.proximaVarredura);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Demo concluído. Para usar com LLM real:');
  console.log('  1. cp .env.example .env');
  console.log('  2. Edite .env com sua chave ANTHROPIC_API_KEY');
  console.log('  3. node index.js lead');
  console.log('  4. node server.js   (interface web em http://localhost:3000)');
  console.log('═══════════════════════════════════════════════════════════\n');
}

demo().catch(console.error);
