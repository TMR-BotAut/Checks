'use strict';

const { callLLM, parseJSON, PROVIDER } = require('../llm-adapter');

const SYSTEM_PROMPT = `Você é um especialista em vendas de planos de saúde da corretora Queiroz Seguros, Teresópolis/RJ.
Gere cadências de contato práticas e realistas para o corretor Rodrigo.
Responda APENAS com JSON válido.`;

function funil_mock(leadData, perfil) {
  const { nome } = leadData;
  const isAlta = perfil.prioridade === 'alta';
  const etapas = isAlta
    ? [
        { etapa: 1, timing: 'D+0 (hoje)', canal: 'WhatsApp', objetivo: 'Primeiro contato e apresentação', mensagem: `Olá ${nome || ''}! Sou o Rodrigo da Queiroz Seguros em Teresópolis. Vi seu interesse em plano de saúde. Posso te apresentar as melhores opções para o seu perfil?` },
        { etapa: 2, timing: 'D+1', canal: 'WhatsApp', objetivo: 'Enviar opções de plano', mensagem: `${nome || 'Olá'}! Separei as melhores opções para você. Quando tiver 10 minutinhos para conversar?` },
        { etapa: 3, timing: 'D+3', canal: 'Ligação', objetivo: 'Follow-up e tirar dúvidas', mensagem: 'Ligação para esclarecer dúvidas e avançar para proposta.' }
      ]
    : [
        { etapa: 1, timing: 'D+1', canal: 'WhatsApp', objetivo: 'Primeiro contato', mensagem: `Olá ${nome || ''}! Sou o Rodrigo da Queiroz Seguros. Posso te ajudar com plano de saúde?` },
        { etapa: 2, timing: 'D+5', canal: 'WhatsApp', objetivo: 'Follow-up com conteúdo', mensagem: `${nome || 'Olá'}! Você sabia que temos planos a partir de R$258/mês em Teresópolis?` },
        { etapa: 3, timing: 'D+10', canal: 'WhatsApp', objetivo: 'Última tentativa ativa', mensagem: `${nome || 'Olá'}! Ainda posso te ajudar a encontrar o plano ideal. Quer dar uma olhada?` }
      ];
  return { etapas, resumo: `Funil de ${etapas.length} etapas — prioridade ${perfil.prioridade}` };
}

async function gerarFunil(leadData, perfil) {
  if (PROVIDER === 'mock') return funil_mock(leadData, perfil);

  const { nome, idade, profissao, orcamento } = leadData;
  const { segmento, prioridade, faixaPrecoReal } = perfil;

  const planosTexto = faixaPrecoReal
    ? faixaPrecoReal.opcoesDentroDoOrcamento.slice(0, 2).join('; ') || faixaPrecoReal.menorPreco?.plano
    : 'a definir';

  const prompt = `Crie uma cadência de contato para este lead da Queiroz Seguros:
Nome: ${nome || 'Lead'}
Idade: ${idade || '?'} anos | Profissão: ${profissao || '?'} | Orçamento: ${orcamento ? `R$${orcamento}` : '?'}
Segmento: ${segmento} | Prioridade: ${prioridade}
Planos indicados: ${planosTexto}
Contexto: nenhum hospital em Teresópolis — internação em Petrópolis/RJ.

Retorne JSON:
{
  "etapas": [
    {"etapa": 1, "timing": "D+0 (hoje)", "canal": "WhatsApp|Ligação|Email|Instagram", "objetivo": "...", "mensagem": "..."}
  ],
  "resumo": "..."
}
Use prioridade ${prioridade}: alta=3 etapas (D+0,D+1,D+3), media=3 etapas (D+1,D+5,D+10), baixa=3 etapas (D+3,D+10,D+20).`;

  try {
    const resp = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1500 });
    const parsed = parseJSON(resp, funil_mock(leadData, perfil));
    return parsed.etapas ? parsed : funil_mock(leadData, perfil);
  } catch {
    return funil_mock(leadData, perfil);
  }
}

module.exports = { gerarFunil };
