'use strict';

// Carteira de planos válida até 25/06/2026.
// Nenhum plano tem hospital em Teresópolis — internação em Petrópolis ou RJ.
// Fonte: tabelas enviadas pelas operadoras à corretora Queiroz Seguros.

// Faixas etárias ANS: 0-18, 19-23, 24-28, 29-33, 34-38, 39-43, 44-48, 49-53, 54-58, 59+
const FAIXAS = [
  { min: 0,  max: 18, label: '0–18' },
  { min: 19, max: 23, label: '19–23' },
  { min: 24, max: 28, label: '24–28' },
  { min: 29, max: 33, label: '29–33' },
  { min: 34, max: 38, label: '34–38' },
  { min: 39, max: 43, label: '39–43' },
  { min: 44, max: 48, label: '44–48' },
  { min: 49, max: 53, label: '49–53' },
  { min: 54, max: 58, label: '54–58' },
  { min: 59, max: 999, label: '59+' }
];

const PLANOS = [
  // ─── PF ───────────────────────────────────────────────────────────────────
  {
    id: 'leve_top_400',
    nome: 'Leve Top 400',
    operadora: 'Leve Saúde',
    segmento: 'pessoa_fisica',
    acomodacao: 'enfermaria',
    coparticipacao: true,
    obstetrica: false,
    alertas: ['Sem cobertura de obstetrícia', 'Sem hospital em Teresópolis — internação em Petrópolis ou RJ', 'Coparticipação em consultas e exames'],
    precos: {
      '0-18':  189.90,
      '19-23': 212.50,
      '24-28': 228.40,
      '29-33': 245.80,
      '34-38': 271.30,
      '39-43': 312.60,
      '44-48': 389.70,
      '49-53': 468.20,
      '54-58': 562.90,
      '59+':   748.30
    },
    rede: ['Petrópolis', 'Rio de Janeiro'],
    vigencia: '2026-06-25'
  },

  // ─── ADESÃO ANASPL ────────────────────────────────────────────────────────
  {
    id: 'amil_bronze_adesao',
    nome: 'Amil Bronze Adesão ANASPL',
    operadora: 'Amil',
    segmento: 'adesao',
    acomodacao: 'enfermaria',
    coparticipacao: true,
    obstetrica: false,
    elegibilidadeAdesao: true,
    entidadeAdesao: 'ANASPL',
    alertas: ['Exclusivo para profissionais elegíveis à ANASPL', 'Sem hospital em Teresópolis', 'Sem obstetrícia'],
    precos: {
      '0-18':  198.40,
      '19-23': 218.10,
      '24-28': 234.60,
      '29-33': 252.80,
      '34-38': 278.50,
      '39-43': 321.40,
      '44-48': 401.20,
      '49-53': 482.60,
      '54-58': 578.90,
      '59+':   769.20
    },
    rede: ['Rio de Janeiro', 'Petrópolis'],
    vigencia: '2026-06-25'
  },
  {
    id: 'supermed_prata_adesao',
    nome: 'Supermed Prata Adesão ANASPL',
    operadora: 'Supermed',
    segmento: 'adesao',
    acomodacao: 'apartamento',
    coparticipacao: false,
    obstetrica: true,
    elegibilidadeAdesao: true,
    entidadeAdesao: 'ANASPL',
    alertas: ['Exclusivo para profissionais elegíveis à ANASPL', 'Sem hospital em Teresópolis'],
    precos: {
      '0-18':  312.80,
      '19-23': 345.20,
      '24-28': 371.40,
      '29-33': 398.60,
      '34-38': 436.90,
      '39-43': 501.80,
      '44-48': 621.30,
      '49-53': 748.50,
      '54-58': 897.20,
      '59+':  1192.80
    },
    rede: ['Rio de Janeiro', 'Petrópolis', 'Niterói'],
    vigencia: '2026-06-25'
  },

  // ─── MEI / PME ────────────────────────────────────────────────────────────
  {
    id: 'amil_bronze_pme',
    nome: 'Amil Bronze PME',
    operadora: 'Amil',
    segmento: 'pme',
    acomodacao: 'enfermaria',
    coparticipacao: true,
    obstetrica: false,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis', 'Sem obstetrícia'],
    precos: {
      '0-18':  268.50,
      '19-23': 295.30,
      '24-28': 318.70,
      '29-33': 341.20,
      '34-38': 374.80,
      '39-43': 432.60,
      '44-48': 538.90,
      '49-53': 648.30,
      '54-58': 776.90,
      '59+':  1032.20
    },
    rede: ['Rio de Janeiro', 'Petrópolis'],
    vigencia: '2026-06-25'
  },
  {
    id: 'amil_prata_pme',
    nome: 'Amil Prata PME',
    operadora: 'Amil',
    segmento: 'pme',
    acomodacao: 'apartamento',
    coparticipacao: false,
    obstetrica: true,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis'],
    precos: {
      '0-18':  389.20,
      '19-23': 428.40,
      '24-28': 462.10,
      '29-33': 495.80,
      '34-38': 542.30,
      '39-43': 623.70,
      '44-48': 778.40,
      '49-53': 934.10,
      '54-58': 1121.90,
      '59+':  1373.90
    },
    rede: ['Rio de Janeiro', 'Petrópolis', 'Niterói'],
    vigencia: '2026-06-25'
  },
  {
    id: 'amil_a50_enf_pme',
    nome: 'Amil A50 Enfermaria PME',
    operadora: 'Amil',
    segmento: 'pme',
    acomodacao: 'enfermaria',
    coparticipacao: false,
    obstetrica: false,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis', 'Sem obstetrícia'],
    precos: {
      '0-18':  298.60,
      '19-23': 328.70,
      '24-28': 354.30,
      '29-33': 380.10,
      '34-38': 416.40,
      '39-43': 479.80,
      '44-48': 598.20,
      '49-53': 718.40,
      '54-58': 862.50,
      '59+':  1146.70
    },
    rede: ['Rio de Janeiro', 'Petrópolis'],
    vigencia: '2026-06-25'
  },
  {
    id: 'amil_a50_apt_pme',
    nome: 'Amil A50 Apartamento PME',
    operadora: 'Amil',
    segmento: 'pme',
    acomodacao: 'apartamento',
    coparticipacao: false,
    obstetrica: true,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis'],
    precos: {
      '0-18':  342.80,
      '19-23': 377.30,
      '24-28': 406.90,
      '29-33': 436.50,
      '34-38': 478.20,
      '39-43': 551.40,
      '44-48': 687.30,
      '49-53': 825.90,
      '54-58': 991.10,
      '59+':  1317.80
    },
    rede: ['Rio de Janeiro', 'Petrópolis', 'Niterói'],
    vigencia: '2026-06-25'
  },
  {
    id: 'assim_classico_pme',
    nome: 'Assim Saúde Clássico PME',
    operadora: 'Assim Saúde',
    segmento: 'pme',
    acomodacao: 'enfermaria',
    coparticipacao: true,
    obstetrica: false,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis', 'Coparticipação moderada'],
    precos: {
      '0-18':  241.30,
      '19-23': 265.60,
      '24-28': 286.40,
      '29-33': 307.20,
      '34-38': 336.80,
      '39-43': 388.10,
      '44-48': 483.60,
      '49-53': 581.30,
      '54-58': 697.60,
      '59+':   927.90
    },
    rede: ['Petrópolis', 'Rio de Janeiro'],
    vigencia: '2026-06-25'
  },
  {
    id: 'assim_especial_100_r1_pme',
    nome: 'Assim Saúde Especial 100 R1',
    operadora: 'Assim Saúde',
    segmento: 'pme',
    acomodacao: 'enfermaria',
    coparticipacao: false,
    obstetrica: false,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis', 'Sem obstetrícia'],
    precos: {
      '0-18':  208.40,
      '19-23': 229.90,
      '24-28': 247.30,
      '29-33': 258.70,
      '34-38': 283.40,
      '39-43': 326.80,
      '44-48': 407.20,
      '49-53': 489.40,
      '54-58': 587.60,
      '59+':   780.90
    },
    rede: ['Petrópolis', 'Rio de Janeiro'],
    vigencia: '2026-06-25'
  },
  {
    id: 'sulamerica_pme',
    nome: 'SulAmérica PME',
    operadora: 'SulAmérica',
    segmento: 'pme',
    acomodacao: 'apartamento',
    coparticipacao: false,
    obstetrica: true,
    alertas: ['Requer CNPJ com mínimo 6 meses', 'Sem hospital em Teresópolis'],
    precos: {
      '0-18':  356.20,
      '19-23': 392.00,
      '24-28': 422.80,
      '29-33': 453.60,
      '34-38': 497.00,
      '39-43': 572.40,
      '44-48': 713.80,
      '49-53': 857.40,
      '54-58': 1029.00,
      '59+':  1368.50
    },
    rede: ['Rio de Janeiro', 'Petrópolis', 'Niterói', 'Volta Redonda'],
    vigencia: '2026-06-25'
  }
];

// Profissões elegíveis para planos de Adesão ANASPL
const PROFISSOES_ANASPL = [
  'administrador', 'advogado', 'arquiteto', 'assistente social', 'biólogo',
  'contador', 'economista', 'enfermeiro', 'engenheiro', 'farmacêutico',
  'fisioterapeuta', 'fonoaudiólogo', 'geógrafo', 'geólogo', 'médico',
  'médico veterinário', 'nutricionista', 'odontólogo', 'psicólogo',
  'publicitário', 'químico', 'secretário', 'sociólogo', 'terapeuta ocupacional'
];

function getFaixaKey(idade) {
  if (idade <= 18)  return '0-18';
  if (idade <= 23)  return '19-23';
  if (idade <= 28)  return '24-28';
  if (idade <= 33)  return '29-33';
  if (idade <= 38)  return '34-38';
  if (idade <= 43)  return '39-43';
  if (idade <= 48)  return '44-48';
  if (idade <= 53)  return '49-53';
  if (idade <= 58)  return '54-58';
  return '59+';
}

function getPrecoParaIdade(plano, idade) {
  const faixa = getFaixaKey(idade);
  return plano.precos[faixa] || null;
}

function filtrarPorSegmento(segmento) {
  if (segmento === 'pme' || segmento === 'mei') {
    return PLANOS.filter(p => p.segmento === 'pme');
  }
  return PLANOS.filter(p => p.segmento === segmento);
}

function verificarElegibilidadeAdesao(profissao) {
  if (!profissao) return false;
  const prof = profissao.toLowerCase().trim();
  return PROFISSOES_ANASPL.some(p => prof.includes(p) || p.includes(prof));
}

function calcularFaixaPreco(segmento, idade, orcamento) {
  const planosFiltrados = filtrarPorSegmento(segmento);
  const planosComPreco = planosFiltrados.map(p => ({
    plano: p.nome,
    operadora: p.operadora,
    id: p.id,
    valor: getPrecoParaIdade(p, idade || 30),
    acomodacao: p.acomodacao,
    coparticipacao: p.coparticipacao,
    obstetrica: p.obstetrica,
    alertas: p.alertas
  })).filter(p => p.valor !== null).sort((a, b) => a.valor - b.valor);

  if (planosComPreco.length === 0) return null;

  const dentro = orcamento ? planosComPreco.filter(p => p.valor <= orcamento) : planosComPreco;
  const alertaOrcamento = orcamento && dentro.length === 0
    ? `Nenhum plano cabe no orçamento de R$${orcamento.toFixed(2)}. O mais barato é ${planosComPreco[0].plano} por R$${planosComPreco[0].valor.toFixed(2)}.`
    : null;

  return {
    menorPreco: { plano: planosComPreco[0].plano, valor: planosComPreco[0].valor },
    maiorPreco: { plano: planosComPreco[planosComPreco.length - 1].plano, valor: planosComPreco[planosComPreco.length - 1].valor },
    opcoesDentroDoOrcamento: dentro.map(p => `${p.plano}: R$${p.valor.toFixed(2)}`),
    todosPlanos: planosComPreco,
    alertaOrcamento
  };
}

module.exports = { PLANOS, FAIXAS, PROFISSOES_ANASPL, getFaixaKey, getPrecoParaIdade, filtrarPorSegmento, verificarElegibilidadeAdesao, calcularFaixaPreco };
