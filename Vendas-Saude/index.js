'use strict';

require('dotenv').config();

const { orquestrar } = require('./agents/agent-skill-5-main');
const { executar: gerente } = require('./agents/agent-skill-6-manager');

const LEAD_EXEMPLO = {
  nome: 'Maria Silva',
  idade: 38,
  profissao: 'enfermeira',
  dependentes: 2,
  orcamento: 600,
  cidade: 'Teresópolis',
  origem: 'WhatsApp',
  temMEI: false,
  anosEmpresa: 0,
  mesesEmpresa: 0,
  mensagem: 'Tenho 38 anos e 2 filhos. Quero plano de saúde familiar. Orçamento R$600.'
};

async function main() {
  const cmd = process.argv[2] || 'lead';

  console.log(`\n🏥 Queiroz Seguros — Bot de Inteligência Comercial`);
  console.log(`📍 Teresópolis/RJ | Modo: ${cmd}\n`);

  try {
    if (cmd === 'lead') {
      const resultado = await orquestrar({ modo: 'novo_lead', leadData: LEAD_EXEMPLO });
      console.log(JSON.stringify(resultado, null, 2));

    } else if (cmd === 'scan') {
      const resultado = await orquestrar({ modo: 'opportunity_scan', cidade: 'Teresópolis' });
      console.log(JSON.stringify(resultado, null, 2));

    } else if (cmd === 'gerente') {
      const resultado = await gerente('full_report', { cidade: 'Teresópolis' });
      console.log(JSON.stringify(resultado, null, 2));

    } else if (cmd === 'demo') {
      require('./demo');

    } else {
      console.log('Comandos disponíveis:');
      console.log('  node index.js lead     — análise de lead exemplo');
      console.log('  node index.js scan     — varredura de oportunidades de mercado');
      console.log('  node index.js gerente  — relatório completo do gerente de vendas');
      console.log('  node server.js         — iniciar servidor web (porta 3000)');
    }
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
}

main();
