'use strict';

require('dotenv').config();

const https = require('https');
const { buscarMEIsTeresopolis } = require('./cnpj-scanner');
const { search } = require('../web-search-adapter');

// ─── HTTP helper com timeout ──────────────────────────────────────────────────
function httpGet(url, timeoutMs = 6000) {
  return new Promise(resolve => {
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'queiroz-seguros-bot/1.0' } }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}

// ─── APIs externas ────────────────────────────────────────────────────────────

async function fetchSelic() {
  const data = await httpGet('https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json');
  if (Array.isArray(data) && data[0]?.valor) {
    return { valor: parseFloat(String(data[0].valor).replace(',', '.')), fonte: 'bcb' };
  }
  return { valor: 13.75, fonte: 'fallback' };
}

async function fetchCambioUSD() {
  const hoje = new Date();
  const mm   = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd   = String(hoje.getDate()).padStart(2, '0');
  const yyyy = hoje.getFullYear();
  const url  = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mm}-${dd}-${yyyy}'&$format=json&$top=1`;
  const data = await httpGet(url);
  const valor = data?.value?.[0]?.cotacaoVenda;
  return valor ? { valor: parseFloat(valor), fonte: 'bcb_ptax' } : { valor: 5.20, fonte: 'fallback' };
}

async function fetchChuvaINMET() {
  // INMET previsão horária — estação A621 (Teresópolis)
  const data = await httpGet('https://apitempo.inmet.gov.br/previsao/1/A621');
  if (Array.isArray(data) && data[0]) {
    const mm = parseFloat(data[0].PRE_PREC || data[0].CHUVA || 0);
    return { mm, fonte: 'inmet' };
  }
  return null; // fallback via sazonalidade
}

// ─── Sazonalidade fixa ────────────────────────────────────────────────────────
// mes: 1=Jan ... 12=Dez
const SAZONAL = {
  // produto → [jan, fev, mar, abr, mai, jun, jul, ago, set, out, nov, dez]
  saude_pf:     [10, 15, 15,  0,  0,  0,  0,  0,  0, 10, 10,  0],
  saude_mei:    [10,  0,  0,  0,  0,  5,  5,  0,  0, 10, 10,  0],
  saude_adesao: [10,  5,  5,  0,  0,  0,  0,  0,  0, 10, 10,  0],
  vida:         [ 0,  0,  0,  0, 10,  8,  0,  0,  0,  0, 12,  0],
  residencial:  [ 5, 15, 15, 10,  0,  0,  0,  0,  0,  5, 20, 20],
  auto:         [15,  0,  0,  0,  0,  0, 10,  0,  0,  0,  0,  0],
  empresarial:  [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  5,  5,  0],
  acidentes:    [ 0,  8,  0,  0,  0,  0, 15,  0,  0, 10,  0,  0],
  viagem:       [ 5, 10,  0,  0,  0, 20, 20,  0,  0,  0, 10, 20],
  rc:           [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  5,  5,  0],
  odonto:       [10, 15, 15,  0,  0,  0,  0,  0,  0, 10, 10,  0],
  consorcio:    [ 5,  0,  0,  0,  0,  0,  0,  0,  0,  5,  5, 10],
  previdencia:  [ 0,  0, 25, 25,  0,  0,  0,  0,  0, 20, 20,  0],
};

function sazonal(produto, mes) {
  return (SAZONAL[produto] || [])[mes - 1] || 0;
}

// ─── Avaliadores por produto ──────────────────────────────────────────────────

async function avaliarSaudeMEI(mes) {
  const cnpj  = await buscarMEIsTeresopolis(30);
  const vol   = cnpj.total || 0;
  const base  = Math.min(50, Math.round((vol / 80) * 50));
  const score = Math.min(100, base + sazonal('saude_mei', mes));
  return {
    produto: 'saude_mei',
    label: 'Saúde MEI/PME',
    score,
    confianca: cnpj.confianca,
    gatilho: `${vol} MEIs completando 6 meses em Teresópolis`,
    sinais: [
      `${vol} MEIs elegíveis PME${cnpj.estimativa ? ' (estimativa)' : ''}`,
      ...(cnpj.estimativa ? ['Configure BRASILIO_API_TOKEN para dados reais'] : [])
    ],
    volume: `~${vol} MEIs`,
    planosIndicados: ['Assim Saúde Especial 100 R1', 'SulAmérica PME', 'Amil A50 Enfermaria'],
    mensagemPronta: 'Seu MEI completou 6 meses? Já pode ter plano PME — 40% mais barato que individual.',
    acaoRecomendada: 'Impulsionar campanha MEI Protegido no Instagram + WhatsApp ativo',
    metaEstimada: score >= 60 ? '15–20 leads em 2 semanas' : '8–12 leads em 4 semanas'
  };
}

async function avaliarSaudePF(mes) {
  const populacao = 175000;
  const beneficiarios = 32500;
  const taxa = (beneficiarios / populacao) * 100;
  const mediaRJ = 25;
  const gap = Math.max(0, mediaRJ - taxa);
  const base = Math.min(40, Math.round(gap * 3));
  const score = Math.min(100, base + sazonal('saude_pf', mes));
  return {
    produto: 'saude_pf',
    label: 'Saúde Pessoa Física',
    score,
    confianca: 'baixa',
    gatilho: `Cobertura local ${taxa.toFixed(1)}% vs média RJ ${mediaRJ}% — gap de ${gap.toFixed(1)} p.p.`,
    sinais: [
      `~${Math.round(populacao * (gap / 100)).toLocaleString('pt-BR')} pessoas sem plano estimadas`,
      'Dado estimado ANS 2024-Q3'
    ],
    volume: `~${Math.round(populacao * (gap / 100)).toLocaleString('pt-BR')} pessoas`,
    planosIndicados: ['Leve Top 400'],
    mensagemPronta: 'Plano de saúde individual a partir de R$189/mês em Teresópolis. Fale com a Queiroz Seguros!',
    acaoRecomendada: 'Campanhas no Instagram para PF autônoma e recém-demitida',
    metaEstimada: '10–15 leads em 4 semanas'
  };
}

async function avaliarSaudeAdesao(mes) {
  const estimativa = Math.round(175000 * 0.042 * 0.85);
  const base = 25;
  const score = Math.min(100, base + sazonal('saude_adesao', mes));
  return {
    produto: 'saude_adesao',
    label: 'Saúde Adesão ANASPL',
    score,
    confianca: 'baixa',
    gatilho: `~${estimativa} profissionais elegíveis ANASPL estimados sem plano`,
    sinais: [
      `~${estimativa} profissionais ainda sem adesão (proporção IBGE)`,
      'Sem API pública de profissionais por município — estimativa'
    ],
    volume: `~${estimativa} profissionais`,
    planosIndicados: ['Amil Bronze Adesão ANASPL', 'Supermed Prata Adesão ANASPL'],
    mensagemPronta: 'Profissional? Acesse planos exclusivos ANASPL com condições especiais para sua categoria.',
    acaoRecomendada: 'Abordagem direta a conselhos profissionais (CRM, CREA, OAB) locais',
    metaEstimada: '8–12 leads em 4 semanas'
  };
}

async function avaliarResidencial(mes, chuvaINMET) {
  let base = 30;
  let gatilho = 'Risco climático histórico de Teresópolis';
  let confianca = 'media';

  if (chuvaINMET) {
    if (chuvaINMET.mm >= 80) { base = 70; gatilho = `${chuvaINMET.mm}mm previstos INMET — alerta de chuva intensa`; confianca = 'alta'; }
    else if (chuvaINMET.mm >= 30) { base = 50; gatilho = `${chuvaINMET.mm}mm previstos INMET`; confianca = 'alta'; }
    else { gatilho = `${chuvaINMET.mm}mm previstos — dia tranquilo`; confianca = 'alta'; }
  }

  const score = Math.min(100, base + sazonal('residencial', mes));
  return {
    produto: 'residencial',
    label: 'Seguro Residencial',
    score,
    confianca,
    gatilho,
    sinais: [
      chuvaINMET ? `Previsão INMET: ${chuvaINMET.mm}mm` : 'Sazonalidade: temporada de chuvas nov–mar',
      'Teresópolis tem maior risco climático do RJ — memória da catástrofe de 2011',
      'Alto volume de segundas residências desocupadas = imóvel sem seguro'
    ],
    volume: '~45.000 domicílios particulares (IBGE)',
    planosIndicados: ['Seguro Residencial — produto a contratar via seguradora parceira'],
    mensagemPronta: 'A temporada de chuvas chegou. Seu imóvel está protegido contra enchentes e deslizamentos?',
    acaoRecomendada: 'Stories no Instagram com fotos de risco climático local + CTA direto no WhatsApp',
    metaEstimada: score >= 60 ? '20–30 leads em 2 semanas' : '8–15 leads em 4 semanas'
  };
}

async function avaliarVida(mes) {
  const score = Math.min(100, 32 + sazonal('vida', mes));
  return {
    produto: 'vida',
    label: 'Seguro de Vida',
    score,
    confianca: 'media',
    gatilho: mes === 5 ? 'Dia das Mães — conscientização sobre proteção familiar' : mes === 6 ? 'Dia dos Pais — gatilho de proteção familiar' : 'Alta concentração de autônomos sem benefício patronal em Teresópolis',
    sinais: [
      'Autônomos do turismo/construção/serviços raramente têm seguro de vida',
      'MEI aberto = perda de cobertura coletiva do empregador',
      'Cross-sell direto com saúde MEI'
    ],
    volume: '~60.000 autônomos e MEIs estimados no município',
    planosIndicados: ['Seguro de Vida — produto a contratar via seguradora parceira'],
    mensagemPronta: 'Quem garante sua família se algo acontecer com você? Seguro de vida a partir de R$30/mês.',
    acaoRecomendada: mes === 5 ? 'Campanha Dia das Mães: proteção para a família' : 'Abordar MEIs e autônomos recém-cadastrados',
    metaEstimada: '10–15 leads em 4 semanas'
  };
}

async function avaliarAuto(mes) {
  const score = Math.min(100, 28 + sazonal('auto', mes));
  return {
    produto: 'auto',
    label: 'Seguro Auto',
    score,
    confianca: 'media',
    gatilho: mes === 1 ? 'Janeiro: IPVA venceu — momento de rever custos do veículo' : mes === 7 ? 'Julho: férias escolares — alto fluxo de turistas' : 'Estradas serranas com alto risco (BR-116, RJ-130)',
    sinais: [
      'Vias serrana com neblina e curvas fechadas — percepção de risco alta',
      'Turistas de fim de semana com carros de valor elevado',
      'MEIs com veículo de trabalho raramente segurado'
    ],
    volume: 'Frota estimada: ~40.000 veículos (SENATRAN)',
    planosIndicados: ['Seguro Auto — produto a contratar via seguradora parceira'],
    mensagemPronta: 'Nas estradas da serra, imprevistos acontecem. Seu carro está protegido?',
    acaoRecomendada: mes === 1 ? 'Campanha IPVA: aproveite o mês de renovação para segurar o carro' : 'Parceria com postos de combustível e hotéis na cidade',
    metaEstimada: '8–12 leads em 4 semanas'
  };
}

async function avaliarEmpresarial(mes) {
  const score = Math.min(100, 20 + sazonal('empresarial', mes));
  return {
    produto: 'empresarial',
    label: 'Seguro Empresarial',
    score,
    confianca: 'baixa',
    gatilho: '750 novas empresas abertas em Teresópolis em 2024 — pool de leads não abordados',
    sinais: [
      '750 CNPJs de comércio/serviços abertos em 2024',
      'Pousadas e restaurantes têm ativos físicos significativos sem seguro',
      'Setor de turismo em expansão'
    ],
    volume: '~750 empresas com CNAE de comércio/serviços abertas em 2024',
    planosIndicados: ['Seguro Empresarial — produto a contratar via seguradora parceira'],
    mensagemPronta: 'Seu negócio está protegido contra incêndio, roubo e responsabilidade? Seguro empresarial sob medida.',
    acaoRecomendada: 'Visita presencial a pousadas, restaurantes e lojas do centro',
    metaEstimada: '5–8 leads em 4 semanas'
  };
}

async function avaliarAcidentes(mes) {
  const score = Math.min(100, 22 + sazonal('acidentes', mes));
  return {
    produto: 'acidentes',
    label: 'Acidentes Pessoais',
    score,
    confianca: 'baixa',
    gatilho: mes === 7 ? 'Férias escolares — pico de trilhas e esportes de aventura' : 'Parque Nacional da Serra dos Órgãos — atividades de risco todo fim de semana',
    sinais: [
      'Capital do montanhismo no RJ — guias de trilha raramente segurados',
      'Parque Nacional da Serra dos Órgãos atrai escalada, rapel, trilha',
      'Trabalhadores autônomos da construção civil sem cobertura patronal'
    ],
    volume: '~5.000 praticantes de esportes de aventura estimados (sazonais + locais)',
    planosIndicados: ['Acidentes Pessoais — produto a contratar via seguradora parceira'],
    mensagemPronta: 'Guia de trilha, escalador ou simplesmente ativo? Acidentes pessoais a partir de R$20/mês.',
    acaoRecomendada: 'Parceria com lojas de equipamentos outdoor e instrutores do PARNASO',
    metaEstimada: '6–10 leads em 4 semanas'
  };
}

async function avaliarViagem(mes, cambio) {
  let bonusCambio = 0;
  let gatilhoCambio = '';
  if (cambio) {
    if (cambio.valor >= 6.00) { bonusCambio = 15; gatilhoCambio = `Dólar R$${cambio.valor.toFixed(2)} — viagem cara, mais razão para segurar`; }
    else if (cambio.valor >= 5.50) { bonusCambio = 8; gatilhoCambio = `Dólar R$${cambio.valor.toFixed(2)}`; }
  }
  const base = 18 + bonusCambio;
  const score = Math.min(100, base + sazonal('viagem', mes));
  return {
    produto: 'viagem',
    label: 'Seguro Viagem',
    score,
    confianca: cambio?.fonte === 'bcb_ptax' ? 'alta' : 'media',
    gatilho: gatilhoCambio || (mes >= 6 && mes <= 7 ? 'Férias escolares de julho — pico de viagens' : mes >= 11 || mes <= 1 ? 'Temporada de verão/festas — alto fluxo de viagens' : 'Sazonalidade de viagens'),
    sinais: [
      cambio ? `Câmbio USD: R$${cambio.valor.toFixed(2)} (BACEN)` : 'Câmbio estimado',
      'Moradores viajam para o exterior (Europa jun–set, EUA dez)',
      'Turistas chegam à cidade — oportunidade de parceria com hotéis'
    ],
    volume: '~3.000–5.000 viagens internacionais/ano estimadas por residentes',
    planosIndicados: ['Seguro Viagem — produto a contratar via seguradora parceira'],
    mensagemPronta: 'Viajando nas férias? Seguro viagem a partir de R$15 para destinos nacionais.',
    acaoRecomendada: mes === 6 || mes === 7 ? 'Campanha férias de julho nas redes sociais + agências de viagem locais' : 'Parceria com hotéis e pousadas para turistas',
    metaEstimada: '8–15 leads em 2 semanas'
  };
}

async function avaliarRC(mes) {
  const score = Math.min(100, 18 + sazonal('rc', mes));
  return {
    produto: 'rc',
    label: 'Responsabilidade Civil',
    score,
    confianca: 'baixa',
    gatilho: 'Profissionais liberais e operadores de aventura com alta exposição de RC sem cobertura',
    sinais: [
      'Guias de aventura, síndicos e operadores de turismo raramente têm RC',
      'CNPJs de serviços profissionais (CNAE 69–75) abertos em 2024',
      'Ausência de API pública — dado estimado'
    ],
    volume: '~2.000 profissionais liberais estimados (médicos, engenheiros, advogados, nutricionistas)',
    planosIndicados: ['RC Profissional — produto a contratar via seguradora parceira'],
    mensagemPronta: 'Profissional liberal? Uma ação judicial pode custar caro. RC profissional te protege.',
    acaoRecomendada: 'Abordagem a conselhos profissionais locais (CRM, CREA-RJ, OAB) e operadores de aventura',
    metaEstimada: '4–8 leads em 4 semanas'
  };
}

async function avaliarOdonto(mes) {
  const score = Math.min(100, 20 + sazonal('odonto', mes));
  return {
    produto: 'odonto',
    label: 'Plano Odontológico',
    score,
    confianca: 'baixa',
    gatilho: 'Gap de cobertura odontológica 30–40% maior que saúde em municípios do interior',
    sinais: [
      'Cobertura odonto ~30–40% menor que saúde no interior (ANS)',
      'Cross-sell: clientes Amil Bronze Adesão (dental vence em 12 meses)',
      'Produto acessível — ticket menor que saúde'
    ],
    volume: '~120.000 pessoas sem plano odontológico estimadas',
    planosIndicados: ['Plano Odontológico — produto a contratar via operadora parceira'],
    mensagemPronta: 'Seu plano de saúde não cobre dentista. Plano odontológico a partir de R$30/mês.',
    acaoRecomendada: 'Contato pró-ativo com clientes de adesão Amil Bronze aos 11 meses de contrato',
    metaEstimada: '10–20 leads em 4 semanas (cross-sell da base)'
  };
}

async function avaliarConsorcio(mes, selic) {
  let bonusSelic = 0;
  let gatilho = 'Alternativa ao financiamento bancário';
  if (selic) {
    if (selic.valor >= 14) { bonusSelic = 35; gatilho = `Selic ${selic.valor}% — financiamento caro, consórcio muito mais barato`; }
    else if (selic.valor >= 12) { bonusSelic = 20; gatilho = `Selic ${selic.valor}% — financiamento caro`; }
    else { gatilho = `Selic ${selic.valor}% — consórcio competitivo com financiamento`; }
  }
  const score = Math.min(100, 20 + bonusSelic + sazonal('consorcio', mes));
  return {
    produto: 'consorcio',
    label: 'Consórcio (imóvel/veículo)',
    score,
    confianca: selic?.fonte === 'bcb' ? 'alta' : 'media',
    gatilho,
    sinais: [
      selic ? `Taxa Selic atual: ${selic.valor}% a.a. (BACEN)` : 'Taxa Selic estimada',
      'Mercado de segunda residência ativo — pessoas do Rio comprando casa em Teresópolis',
      'MEIs precisando de veículo de trabalho sem entrada'
    ],
    volume: 'Faixa 28–45 anos: ~40.000 pessoas em Teresópolis (IBGE)',
    planosIndicados: ['Consórcio Imóvel', 'Consórcio Veículo', 'Consórcio Serviços (reforma)'],
    mensagemPronta: `Com Selic a ${selic?.valor || '?'}%, financiamento ficou caro. Consórcio: sem juros, só taxa de administração.`,
    acaoRecomendada: 'Abordagem a MEIs e autônomos + parceria com imobiliárias locais',
    metaEstimada: '8–12 leads em 4 semanas'
  };
}

async function avaliarPrevidencia(mes) {
  const score = Math.min(100, 22 + sazonal('previdencia', mes));
  return {
    produto: 'previdencia',
    label: 'Previdência Privada (PGBL/VGBL)',
    score,
    confianca: 'media',
    gatilho: mes === 3 || mes === 4 ? 'Temporada IR — janela ideal para PGBL (dedução fiscal até 12% da renda)' : mes === 10 || mes === 11 ? 'Planejamento de final de ano — última contribuição do exercício' : 'MEIs: INSS MEI garante apenas 1 salário mínimo de aposentadoria',
    sinais: [
      'MEI contributivo garante apenas R$1.518/mês de aposentadoria (INSS 2026)',
      'Alta concentração de autônomos sem previdência complementar',
      mes === 3 || mes === 4 ? 'Prazo IR: janela de PGBL até 30/abril' : 'Cross-sell crítico com saúde MEI'
    ],
    volume: '~20.000 MEIs e autônomos sem previdência privada estimados',
    planosIndicados: ['PGBL (declara IR completo)', 'VGBL (demais perfis)'],
    mensagemPronta: 'MEI: seu INSS garante só 1 salário mínimo de aposentadoria. Previdência privada completa o resto.',
    acaoRecomendada: mes === 3 || mes === 4 ? 'Campanha IR: PGBL reduz imposto e garante aposentadoria' : 'Abordar MEIs na conversa de saúde — mencionar previdência na mesma visita',
    metaEstimada: score >= 50 ? '15–20 leads em 2 semanas' : '8–12 leads em 4 semanas'
  };
}

// ─── Busca orgânica transversal ───────────────────────────────────────────────
async function sinalizadorBuscaOrganica() {
  try {
    const r = await search('plano de saúde Teresópolis', { num: 3 });
    const ok = r.results?.length > 0;
    return { score: ok ? 12 : 0, sinal: ok ? 'Busca orgânica ativa para "plano de saúde Teresópolis"' : 'Sem sinal de busca orgânica', fonte: r.provider };
  } catch {
    return { score: 0, sinal: 'Busca web indisponível', fonte: 'indisponível' };
  }
}

// ─── Scanner principal ────────────────────────────────────────────────────────
async function scan(cidade = 'Teresópolis') {
  const hoje  = new Date();
  const mes   = hoje.getMonth() + 1;

  // Buscar APIs externas em paralelo (falhas silenciosas)
  const [selic, cambio, chuva, buscaOrg] = await Promise.all([
    fetchSelic(),
    fetchCambioUSD(),
    fetchChuvaINMET(),
    sinalizadorBuscaOrganica()
  ]);

  // Avaliar todos os produtos em paralelo
  const resultados = await Promise.all([
    avaliarSaudeMEI(mes),
    avaliarSaudePF(mes),
    avaliarSaudeAdesao(mes),
    avaliarResidencial(mes, chuva),
    avaliarVida(mes),
    avaliarAuto(mes),
    avaliarEmpresarial(mes),
    avaliarAcidentes(mes),
    avaliarViagem(mes, cambio),
    avaliarRC(mes),
    avaliarOdonto(mes),
    avaliarConsorcio(mes, selic),
    avaliarPrevidencia(mes)
  ]);

  // Aplicar sinal de busca orgânica (todos os segmentos de saúde)
  resultados.forEach(r => {
    if (r.produto.startsWith('saude')) {
      r.score = Math.min(100, r.score + buscaOrg.score);
      if (buscaOrg.score > 0) r.sinais.push(buscaOrg.sinal);
    }
  });

  // Ordenar por score desc
  resultados.sort((a, b) => b.score - a.score);

  const vencedor = resultados[0];

  // Cross-sell alert com base no produto vencedor
  const crossSellMap = {
    saude_mei:    'MEI ativo: abordar saúde PME → previdência → RC profissional → consórcio veículo na mesma conversa.',
    saude_pf:     'PF demitida: abordar saúde individual → seguro de vida → previdência.',
    saude_adesao: 'Profissional liberal: abordar adesão → RC profissional → previdência → odontológico.',
    residencial:  'Proprietário: abordar residencial → seguro de vida → consórcio imóvel.',
    vida:         'Autônomo: abordar vida → previdência → acidentes pessoais.',
    consorcio:    'Consórcio imóvel: abordar residencial → vida → previdência na mesma conversa.',
    previdencia:  'Previdência: abordar junto com saúde MEI para autônomos — mesma visita.',
  };

  const proxVarredura = new Date(hoje);
  proxVarredura.setDate(proxVarredura.getDate() + 7);

  const fontes = [
    'brasil.io (MEI)',
    selic?.fonte === 'bcb' ? 'bcb.gov.br (Selic)' : null,
    cambio?.fonte === 'bcb_ptax' ? 'bcb.gov.br (câmbio)' : null,
    chuva?.fonte === 'inmet' ? 'inmet.gov.br (chuva)' : null,
    buscaOrg.fonte !== 'indisponível' ? buscaOrg.fonte : null,
    'ANS 2024-Q3 (estimativas)',
    'IBGE/SEBRAE (estimativas)'
  ].filter(Boolean);

  return {
    dataVarredura: hoje.toISOString().slice(0, 10),
    cidade,
    scores: resultados,
    recomendacao: vencedor.produto,
    recomendacaoLabel: vencedor.label,
    mensagemCampanha: vencedor.mensagemPronta,
    crossSellAlerta: crossSellMap[vencedor.produto] || `${vencedor.label} em alta — focar esforços comerciais esta semana.`,
    dadosAPI: {
      selic: selic?.valor,
      cambioUSD: cambio?.valor,
      chuvaMM: chuva?.mm ?? null
    },
    fontes,
    proximaVarredura: proxVarredura.toISOString().slice(0, 10)
  };
}

// ─── Exports legados (compatibilidade) ───────────────────────────────────────
async function avaliarMEI() { return avaliarSaudeMEI(new Date().getMonth() + 1); }
async function avaliarPF()  { return avaliarSaudePF(new Date().getMonth() + 1); }
async function avaliarAdesao() { return avaliarSaudeAdesao(new Date().getMonth() + 1); }

module.exports = { scan, avaliarMEI, avaliarPF, avaliarAdesao };
