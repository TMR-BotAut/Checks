'use strict';

require('dotenv').config();

const https = require('https');
const { buscarMEIsTeresopolis } = require('./cnpj-scanner');
const { search } = require('../web-search-adapter');

// ─── HTTP helper ──────────────────────────────────────────────────────────────
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
  if (Array.isArray(data) && data[0]?.valor)
    return { valor: parseFloat(String(data[0].valor).replace(',', '.')), fonte: 'bcb' };
  return { valor: 13.75, fonte: 'fallback' };
}

async function fetchCambioUSD() {
  const hoje = new Date();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  const yyyy = hoje.getFullYear();
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mm}-${dd}-${yyyy}'&$format=json&$top=1`;
  const data = await httpGet(url);
  const valor = data?.value?.[0]?.cotacaoVenda;
  return valor ? { valor: parseFloat(valor), fonte: 'bcb_ptax' } : { valor: 5.20, fonte: 'fallback' };
}

async function fetchChuvaINMET() {
  const data = await httpGet('https://apitempo.inmet.gov.br/previsao/1/A621');
  if (Array.isArray(data) && data[0]) {
    const mm = parseFloat(data[0].PRE_PREC || data[0].CHUVA || 0);
    return { mm, fonte: 'inmet' };
  }
  return null;
}

// ─── Sazonalidade fixa (índice 0 = Jan) ──────────────────────────────────────
const SAZONAL = {
  saude_pf:     [10,15,15, 0, 0, 0, 0, 0, 0,10,10, 0],
  saude_mei:    [10, 0, 0, 0, 0, 5, 5, 0, 0,10,10, 0],
  saude_adesao: [10, 5, 5, 0, 0, 0, 0, 0, 0,10,10, 0],
  vida:         [ 0, 0, 0, 0,10, 8, 0, 0, 0, 0,12, 0],
  residencial:  [ 5,15,15,10, 0, 0, 0, 0, 0, 5,20,20],
  auto:         [15, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 0],
  empresarial:  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 0],
  acidentes:    [ 0, 8, 0, 0, 0, 0,15, 0, 0,10, 0, 0],
  viagem:       [ 5,10, 0, 0, 0,20,20, 0, 0, 0,10,20],
  rc:           [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 0],
  odonto:       [10,15,15, 0, 0, 0, 0, 0, 0,10,10, 0],
  consorcio:    [ 5, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5,10],
  previdencia:  [ 0, 0,25,25, 0, 0, 0, 0, 0,20,20, 0],
};

function sazonal(produto, mes) { return (SAZONAL[produto] || [])[mes - 1] || 0; }

// ─── Financeiro por produto (comissão estimada que o corretor recebe) ─────────
// receita_anual = volume_potencial × taxa_conversao × ticket_mensal × 12
const FINANCEIRO = {
  saude_mei:    { ticket_mensal: 38, taxa_conversao: 5,  vol_base: 120 },
  saude_pf:     { ticket_mensal: 30, taxa_conversao: 3,  vol_base: 200 },
  saude_adesao: { ticket_mensal: 35, taxa_conversao: 4,  vol_base: 80  },
  residencial:  { ticket_mensal: 16, taxa_conversao: 8,  vol_base: 150 },
  vida:         { ticket_mensal: 11, taxa_conversao: 7,  vol_base: 100 },
  auto:         { ticket_mensal: 22, taxa_conversao: 5,  vol_base: 120 },
  empresarial:  { ticket_mensal: 55, taxa_conversao: 4,  vol_base: 60  },
  acidentes:    { ticket_mensal: 9,  taxa_conversao: 10, vol_base: 80  },
  viagem:       { ticket_mensal: 14, taxa_conversao: 12, vol_base: 60  },
  rc:           { ticket_mensal: 45, taxa_conversao: 4,  vol_base: 50  },
  odonto:       { ticket_mensal: 9,  taxa_conversao: 8,  vol_base: 120 },
  consorcio:    { ticket_mensal: 220, taxa_conversao: 2, vol_base: 40  },
  previdencia:  { ticket_mensal: 65, taxa_conversao: 4,  vol_base: 80  },
};

function calcReceita(produto, score) {
  const f = FINANCEIRO[produto];
  if (!f) return 0;
  const fator = Math.max(0.5, score / 70);
  return Math.round(f.vol_base * (f.taxa_conversao / 100) * f.ticket_mensal * 12 * fator / 100) * 100;
}

function confPct(confianca) {
  return { alta: 88, media: 65, baixa: 45 }[confianca] || 50;
}

// ─── Perfis de cliente por produto ───────────────────────────────────────────
const PERFIS = {
  saude_mei:    { tipo: 'MEI / Empresa Individual', faturamento: 'Até R$ 81.000/ano', setor: 'Comércio, Serviços, Construção', tempo_abertura: '6–18 meses', equipe: '1–3 funcionários', localizacao: 'Teresópolis e distritos' },
  saude_pf:     { tipo: 'Pessoa Física Autônoma', faturamento: 'Qualquer', setor: 'Profissionais sem vínculo CLT', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis' },
  saude_adesao: { tipo: 'Profissional Liberal', faturamento: 'Qualquer', setor: 'Saúde, Direito, Engenharia, Nutrição', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis e região serrana' },
  residencial:  { tipo: 'Proprietário ou Locatário', faturamento: 'Qualquer', setor: 'Residencial / Segunda residência', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis, zona serrana e distritos' },
  vida:         { tipo: 'Autônomo com Dependentes', faturamento: 'Qualquer', setor: 'Turismo, Construção, Serviços', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis' },
  auto:         { tipo: 'Proprietário de Veículo', faturamento: 'Qualquer', setor: 'MEI com veículo de trabalho / Turistas', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis e BR-116' },
  empresarial:  { tipo: 'Empresa com Ponto Físico', faturamento: 'Acima R$ 10.000/mês', setor: 'Pousadas, Restaurantes, Comércio', tempo_abertura: '12+ meses', equipe: '3+ funcionários', localizacao: 'Centro e bairros turísticos' },
  acidentes:    { tipo: 'Autônomo / Esportista', faturamento: 'Qualquer', setor: 'Guias de trilha, construção civil, esportes', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis / PARNASO' },
  viagem:       { tipo: 'Viajante Frequente', faturamento: 'Qualquer', setor: 'Família, executivos, turistas', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis (residente)' },
  rc:           { tipo: 'Profissional Liberal / Operador', faturamento: 'Qualquer', setor: 'Médicos, Advogados, Guias, Síndicos', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis' },
  odonto:       { tipo: 'PF ou MEI sem Dental', faturamento: 'Qualquer', setor: 'Qualquer (cross-sell com saúde)', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis' },
  consorcio:    { tipo: 'Comprador de Imóvel / Veículo', faturamento: 'Qualquer', setor: 'Família, MEI, Segunda residência', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis e cidades vizinhas' },
  previdencia:  { tipo: 'MEI / Autônomo 35–55 anos', faturamento: 'Qualquer', setor: 'Todos os autônomos sem previdência patronal', tempo_abertura: '-', equipe: '-', localizacao: 'Teresópolis' },
};

// ─── Ações recomendadas por produto ──────────────────────────────────────────
const ACOES = {
  saude_mei: [
    { numero: 1, descricao: 'Consultar MEIs com 6–12 meses de abertura via Brasil.IO', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Contato por WhatsApp com mensagem de elegibilidade PME', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Apresentar Assim Saúde Especial 100 R1 (R$327) como opção de entrada', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Na mesma visita: oferecer previdência privada (INSS MEI = 1 salário mínimo)', tipo: 'obrigatoria' },
    { numero: 5, descricao: 'Reagendar em 30 dias com novo dado (ex: reajuste de plano individual)', tipo: 'condicional', condicao: 'Se não fechar →' },
    { numero: 6, descricao: 'Cross-sell: RC Profissional e Acidentes Pessoais após 3 meses', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  saude_pf: [
    { numero: 1, descricao: 'Segmentar leads por faixa etária (preço muda muito entre faixas ANS)', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Oferecer Leve Top 400 como plano de entrada para PF', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Alertar sobre rede em Petrópolis (sem hospital em Teresópolis)', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Se lead acabou de perder emprego: mencionar janela de contratação sem carência', tipo: 'condicional', condicao: 'Se demitido recente →' },
    { numero: 5, descricao: 'Cross-sell: Seguro de Vida e Plano Odontológico na mesma conversa', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  saude_adesao: [
    { numero: 1, descricao: 'Verificar profissão elegível ANASPL antes de abordar', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Contato direto com conselhos profissionais locais (CRM, CREA, OAB)', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Apresentar Amil Bronze Adesão ANASPL como opção de entrada', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Cross-sell: RC Profissional (profissionais liberais têm alta exposição)', tipo: 'condicional', condicao: 'Se fechar →' },
    { numero: 5, descricao: 'Ao 11º mês: oferecer plano odontológico autônomo (dental da adesão vence)', tipo: 'condicional', condicao: 'Após 11 meses de contrato →' },
  ],
  residencial: [
    { numero: 1, descricao: 'Disparar stories no Instagram com imagem de risco climático local', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'CTA direto para WhatsApp: "Imóvel protegido contra enchentes?"', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Focar em proprietários de segunda residência (imóvel desocupado = maior risco)', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Parceria com imobiliárias locais — novo imóvel = momento de contratar seguro', tipo: 'obrigatoria' },
    { numero: 5, descricao: 'Cross-sell: Seguro de Vida na mesma visita', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  vida: [
    { numero: 1, descricao: 'Listar autônomos e MEIs recém-abertos como alvo primário', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Abordagem emocional: "Quem garante sua família se algo acontecer?"', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Oferecer plano de vida a partir de R$30/mês (produto acessível)', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Usar Dia das Mães / Dia dos Pais como gatilho de campanha', tipo: 'condicional', condicao: 'Se maio/junho →' },
    { numero: 5, descricao: 'Cross-sell: Previdência Privada e Acidentes Pessoais', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  auto: [
    { numero: 1, descricao: 'Campanha IPVA: "Renovou o IPVA? Renove o seguro também"', tipo: 'condicional', condicao: 'Se janeiro →' },
    { numero: 2, descricao: 'Parceria com postos de combustível e oficinas mecânicas', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Abordagem a MEIs com veículo de trabalho (veículo = ferramenta de renda)', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Destacar riscos das estradas serranas (BR-116, RJ-130, neblina)', tipo: 'obrigatoria' },
  ],
  empresarial: [
    { numero: 1, descricao: 'Mapear pousadas, restaurantes e lojas abertas nos últimos 24 meses via Brasil.IO', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Visita presencial ao comércio local com proposta personalizada', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Enfatizar risco real: incêndio, roubo, responsabilidade com terceiros', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Cross-sell: RC Empresarial + Saúde PME para os funcionários', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  acidentes: [
    { numero: 1, descricao: 'Contato com guias de trilha e operadores do PARNASO', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Parceria com lojas de equipamentos outdoor (escalada, trilha)', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Campanha nas férias escolares: "Você pratica esportes? Está protegido?"', tipo: 'condicional', condicao: 'Se julho/outubro →' },
    { numero: 4, descricao: 'Oferecer cobertura a preços muito acessíveis (R$20–50/mês)', tipo: 'obrigatoria' },
  ],
  viagem: [
    { numero: 1, descricao: 'Campanha de férias de julho nas redes sociais', tipo: 'condicional', condicao: 'Se junho/julho →' },
    { numero: 2, descricao: 'Parceria com agências de viagem locais e hotéis', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Destacar câmbio atual: viagem cara = mais razão para segurar', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Cross-sell: Acidentes Pessoais para viajantes frequentes', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  rc: [
    { numero: 1, descricao: 'Mapear profissionais liberais via CNPJs de serviços (CNAE 69–75)', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Abordagem a guias de aventura — alta exposição, baixíssima proteção', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Contato com síndicos de condomínios (RC Síndico é produto específico)', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Oferecer RC junto com saúde adesão para profissionais liberais', tipo: 'condicional', condicao: 'Junto com adesão ANASPL →' },
  ],
  odonto: [
    { numero: 1, descricao: 'Verificar base de clientes com adesão Amil Bronze (dental vence em 12 meses)', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Contato proativo no 11º mês de contrato com proposta de dental autônomo', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Oferecer como add-on em toda venda de plano de saúde', tipo: 'obrigatoria' },
  ],
  consorcio: [
    { numero: 1, descricao: 'Abordar MEIs e autônomos que querem imóvel mas não têm entrada', tipo: 'obrigatoria' },
    { numero: 2, descricao: 'Parceria com imobiliárias: "Sem entrada para financiar? Consórcio resolve"', tipo: 'obrigatoria' },
    { numero: 3, descricao: `Destacar Selic atual vs. taxa de administração do consórcio`, tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Cross-sell: Seguro Residencial + Vida ao fechar consórcio imóvel', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
  previdencia: [
    { numero: 1, descricao: 'Campanha IR: PGBL deduz até 12% da renda bruta — janela até 30/abril', tipo: 'condicional', condicao: 'Se março/abril →' },
    { numero: 2, descricao: 'Abordar MEI: "Seu INSS garante só R$1.518/mês de aposentadoria"', tipo: 'obrigatoria' },
    { numero: 3, descricao: 'Indicar PGBL para quem declara IR completo, VGBL para demais', tipo: 'obrigatoria' },
    { numero: 4, descricao: 'Incluir previdência em TODA conversa de saúde MEI — mesmo encontro', tipo: 'obrigatoria' },
    { numero: 5, descricao: 'Cross-sell: Consórcio Imóvel (planejamento patrimonial integrado)', tipo: 'condicional', condicao: 'Se fechar →' },
  ],
};

// ─── Fatores impulsionadores por produto ─────────────────────────────────────
function buildFatores(produto, score, mes, dadosExtras = {}) {
  const base = {
    saude_mei:    ['MEIs completando 6 meses de elegibilidade PME em Teresópolis', 'Plano PME custa 40% menos que individual', 'INSS MEI garante apenas 1 salário mínimo de aposentadoria — argumento de abertura'],
    saude_pf:     ['Gap de cobertura: ~18% abaixo da média estadual do RJ', 'Reajuste ANS anunciado → leads buscando alternativa', 'Alta concentração de autônomos sem benefício patronal'],
    saude_adesao: ['~6.200 profissionais elegíveis ANASPL estimados em Teresópolis', 'Planos adesão com condições especiais por categoria profissional', 'Profissionais liberais raramente têm plano empresarial'],
    residencial:  ['Teresópolis: maior risco climático do RJ (memória da catástrofe de 2011)', 'Alto volume de segundas residências desocupadas e sem seguro', 'Temporada de chuvas nov–mar gera gatilho de conscientização real'],
    vida:         ['Alta concentração de autônomos do turismo e construção sem benefício patronal', 'Abertura de MEI = perda de seguro de vida coletivo do empregador', 'Produto acessível: a partir de R$30/mês'],
    auto:         ['Estradas serranas com neblina e curvas fechadas — percepção de risco alta', 'BR-116 e RJ-130 têm histórico de acidentes', 'Turistas com carros de valor elevado passando pela cidade todo fim de semana'],
    empresarial:  ['750 empresas abertas em Teresópolis em 2024 — pool não abordado', 'Setor de turismo tem ativos físicos significativos sem seguro', 'Restaurantes e pousadas raramente contratam seguro empresarial'],
    acidentes:    ['Capital do montanhismo do RJ — PARNASO atrai escalada, trilha e rapel todo fim de semana', 'Guias de trilha e instrutores raramente têm cobertura pessoal', 'Produto de ticket baixo — facilita fechamento'],
    viagem:       ['Moradores viajam para exterior nas férias (Europa jun–set, EUA dez)', 'Câmbio alto torna viagem cara — mais razão para segurar'],
    rc:           ['Guias de aventura e operadores de turismo têm alta exposição de RC sem cobertura', 'Síndicos de condomínio: maior categoria de empregadores do município', 'Profissionais de saúde e engenharia: risco de processo judicial crescente'],
    odonto:       ['Gap odontológico 30–40% maior que saúde em municípios do interior', 'Cross-sell com base de clientes existentes (adesão Amil Bronze)', 'Produto acessível: a partir de R$30/mês'],
    consorcio:    ['Mercado de segunda residência ativo em Teresópolis', 'Pessoas do Rio e Niterói querem comprar imóvel mas não têm entrada', 'Sem juros: só taxa de administração (vantagem vs. financiamento bancário)'],
    previdencia:  ['MEI contributivo garante apenas R$1.518/mês de aposentadoria pelo INSS (2026)', 'Alta concentração de autônomos sem previdência patronal em Teresópolis', 'Janela de IR (mar/abr): PGBL deduz até 12% da renda bruta'],
  };

  const fatores = [...(base[produto] || [])];

  // Adicionar fator dinâmico baseado em dados externos
  if (dadosExtras.selic && produto === 'consorcio')
    fatores.unshift(`Selic a ${dadosExtras.selic}% a.a. — financiamento bancário caro, consórcio muito mais barato`);
  if (dadosExtras.cambio && produto === 'viagem')
    fatores.unshift(`Dólar a R$${dadosExtras.cambio.toFixed(2)} — viagem internacional cara = mais razão para segurar`);
  if (dadosExtras.chuvaMM != null && dadosExtras.chuvaMM >= 30 && produto === 'residencial')
    fatores.unshift(`Previsão INMET: ${dadosExtras.chuvaMM}mm de chuva — gatilho real de conscientização`);

  return fatores.slice(0, 5);
}

// ─── Avaliadores ──────────────────────────────────────────────────────────────
async function avaliarSaudeMEI(mes) {
  const cnpj  = await buscarMEIsTeresopolis(30);
  const vol   = cnpj.total || 0;
  const base  = Math.min(50, Math.round((vol / 80) * 50));
  const score = Math.min(100, base + sazonal('saude_mei', mes));
  return { produto: 'saude_mei', label: 'Saúde MEI/PME', score, confianca: cnpj.confianca, confianca_percentual: confPct(cnpj.confianca), receita_potencial: calcReceita('saude_mei', score), ticket_medio: FINANCEIRO.saude_mei.ticket_mensal, taxa_conversao: FINANCEIRO.saude_mei.taxa_conversao, sinais: [`${vol} MEIs elegíveis PME${cnpj.estimativa?' (estimativa)':''}`, ...(cnpj.estimativa?['Configure BRASILIO_API_TOKEN para dados reais']:[])], volume: `~${vol} MEIs`, perfil_cliente: PERFIS.saude_mei, acoes_recomendadas: ACOES.saude_mei, planosIndicados: ['Assim Saúde Especial 100 R1', 'SulAmérica PME', 'Amil A50 Enfermaria'], mensagemPronta: 'Seu MEI completou 6 meses? Já pode ter plano PME — 40% mais barato que individual.', acaoRecomendada: 'Impulsionar campanha MEI Protegido no Instagram + WhatsApp ativo', metaEstimada: score >= 60 ? '15–20 leads em 2 semanas' : '8–12 leads em 4 semanas', gatilho: `${vol} MEIs completando 6 meses em Teresópolis` };
}

async function avaliarSaudePF(mes) {
  const populacao = 175000, beneficiarios = 32500;
  const taxa = (beneficiarios / populacao) * 100, mediaRJ = 25, gap = Math.max(0, mediaRJ - taxa);
  const base = Math.min(40, Math.round(gap * 3));
  const score = Math.min(100, base + sazonal('saude_pf', mes));
  return { produto: 'saude_pf', label: 'Saúde Pessoa Física', score, confianca: 'baixa', confianca_percentual: 45, receita_potencial: calcReceita('saude_pf', score), ticket_medio: FINANCEIRO.saude_pf.ticket_mensal, taxa_conversao: FINANCEIRO.saude_pf.taxa_conversao, sinais: [`~${Math.round(populacao*(gap/100)).toLocaleString('pt-BR')} pessoas sem plano estimadas`, 'Dado estimado ANS 2024-Q3'], volume: `~${Math.round(populacao*(gap/100)).toLocaleString('pt-BR')} pessoas`, perfil_cliente: PERFIS.saude_pf, acoes_recomendadas: ACOES.saude_pf, planosIndicados: ['Leve Top 400'], mensagemPronta: 'Plano de saúde individual a partir de R$189/mês em Teresópolis.', acaoRecomendada: 'Campanha Instagram PF autônoma e recém-demitida', metaEstimada: '10–15 leads em 4 semanas', gatilho: `Cobertura local ${taxa.toFixed(1)}% vs média RJ ${mediaRJ}% — gap de ${gap.toFixed(1)} p.p.` };
}

async function avaliarSaudeAdesao(mes) {
  const mercado = Math.round(175000 * 0.042 * 0.85);
  const score = Math.min(100, 25 + sazonal('saude_adesao', mes));
  return { produto: 'saude_adesao', label: 'Saúde Adesão ANASPL', score, confianca: 'baixa', confianca_percentual: 45, receita_potencial: calcReceita('saude_adesao', score), ticket_medio: FINANCEIRO.saude_adesao.ticket_mensal, taxa_conversao: FINANCEIRO.saude_adesao.taxa_conversao, sinais: [`~${mercado} profissionais elegíveis sem adesão (proporção IBGE)`, 'Sem API pública — estimativa'], volume: `~${mercado} profissionais`, perfil_cliente: PERFIS.saude_adesao, acoes_recomendadas: ACOES.saude_adesao, planosIndicados: ['Amil Bronze Adesão ANASPL', 'Supermed Prata Adesão ANASPL'], mensagemPronta: 'Profissional? Acesse planos exclusivos ANASPL com condições especiais.', acaoRecomendada: 'Abordagem a conselhos profissionais locais (CRM, CREA, OAB)', metaEstimada: '8–12 leads em 4 semanas', gatilho: `~${mercado} profissionais elegíveis ANASPL sem plano em Teresópolis` };
}

async function avaliarResidencial(mes, chuva) {
  let base = 30, gatilho = 'Risco climático histórico de Teresópolis', confianca = 'media';
  if (chuva) {
    if (chuva.mm >= 80)       { base = 70; gatilho = `${chuva.mm}mm previstos INMET — alerta de chuva intensa`; confianca = 'alta'; }
    else if (chuva.mm >= 30)  { base = 50; gatilho = `${chuva.mm}mm previstos INMET`; confianca = 'alta'; }
    else                       { gatilho = `${chuva.mm}mm previstos — dia tranquilo`; confianca = 'alta'; }
  }
  const score = Math.min(100, base + sazonal('residencial', mes));
  return { produto: 'residencial', label: 'Seguro Residencial', score, confianca, confianca_percentual: confPct(confianca), receita_potencial: calcReceita('residencial', score), ticket_medio: FINANCEIRO.residencial.ticket_mensal, taxa_conversao: FINANCEIRO.residencial.taxa_conversao, sinais: [chuva?`Previsão INMET: ${chuva.mm}mm`:'Sazonalidade: temporada de chuvas nov–mar', 'Maior risco climático do RJ — memória da catástrofe de 2011', '~45.000 domicílios — grande parte sem seguro'], volume: '~45.000 domicílios', perfil_cliente: PERFIS.residencial, acoes_recomendadas: ACOES.residencial, planosIndicados: ['Seguro Residencial (via seguradora parceira)'], mensagemPronta: 'A temporada de chuvas chegou. Seu imóvel está protegido contra enchentes e deslizamentos?', acaoRecomendada: 'Stories Instagram com imagens de risco climático local + CTA WhatsApp', metaEstimada: score >= 60 ? '20–30 leads em 2 semanas' : '8–15 leads em 4 semanas', gatilho };
}

async function avaliarVida(mes) {
  const score = Math.min(100, 32 + sazonal('vida', mes));
  const g = mes===5?'Dia das Mães — conscientização sobre proteção familiar':mes===6?'Dia dos Pais — proteção familiar':'Alta concentração de autônomos sem benefício patronal';
  return { produto: 'vida', label: 'Seguro de Vida', score, confianca: 'media', confianca_percentual: 65, receita_potencial: calcReceita('vida', score), ticket_medio: FINANCEIRO.vida.ticket_mensal, taxa_conversao: FINANCEIRO.vida.taxa_conversao, sinais: ['Autônomos do turismo/construção raramente têm seguro de vida', 'MEI aberto = perda de cobertura coletiva do empregador', 'Cross-sell direto com saúde MEI'], volume: '~60.000 autônomos e MEIs estimados', perfil_cliente: PERFIS.vida, acoes_recomendadas: ACOES.vida, planosIndicados: ['Seguro de Vida (via seguradora parceira)'], mensagemPronta: 'Quem garante sua família se algo acontecer com você? Seguro de vida a partir de R$30/mês.', acaoRecomendada: mes===5?'Campanha Dia das Mães: proteção para a família':'Abordar MEIs e autônomos recém-cadastrados', metaEstimada: '10–15 leads em 4 semanas', gatilho: g };
}

async function avaliarAuto(mes) {
  const score = Math.min(100, 28 + sazonal('auto', mes));
  const g = mes===1?'Janeiro: IPVA venceu — momento de rever custos do veículo':mes===7?'Julho: férias escolares — alto fluxo de turistas':'Estradas serranas com alto risco (BR-116, RJ-130)';
  return { produto: 'auto', label: 'Seguro Auto', score, confianca: 'media', confianca_percentual: 65, receita_potencial: calcReceita('auto', score), ticket_medio: FINANCEIRO.auto.ticket_mensal, taxa_conversao: FINANCEIRO.auto.taxa_conversao, sinais: ['Vias serranas com neblina e curvas fechadas', 'Turistas com carros de valor elevado todo fim de semana', 'MEIs com veículo de trabalho raramente segurado'], volume: 'Frota estimada: ~40.000 veículos (SENATRAN)', perfil_cliente: PERFIS.auto, acoes_recomendadas: ACOES.auto, planosIndicados: ['Seguro Auto (via seguradora parceira)'], mensagemPronta: 'Nas estradas da serra, imprevistos acontecem. Seu carro está protegido?', acaoRecomendada: mes===1?'Campanha IPVA: aproveite o mês de renovação para segurar o carro':'Parceria com postos e hotéis', metaEstimada: '8–12 leads em 4 semanas', gatilho: g };
}

async function avaliarEmpresarial(mes) {
  const score = Math.min(100, 20 + sazonal('empresarial', mes));
  return { produto: 'empresarial', label: 'Seguro Empresarial', score, confianca: 'baixa', confianca_percentual: 45, receita_potencial: calcReceita('empresarial', score), ticket_medio: FINANCEIRO.empresarial.ticket_mensal, taxa_conversao: FINANCEIRO.empresarial.taxa_conversao, sinais: ['750 CNPJs de comércio/serviços abertos em 2024', 'Pousadas e restaurantes com ativos físicos sem seguro', 'Setor de turismo em expansão'], volume: '~750 empresas com CNAE comércio/serviços (2024)', perfil_cliente: PERFIS.empresarial, acoes_recomendadas: ACOES.empresarial, planosIndicados: ['Seguro Empresarial (via seguradora parceira)'], mensagemPronta: 'Seu negócio está protegido contra incêndio, roubo e responsabilidade? Seguro empresarial sob medida.', acaoRecomendada: 'Visita presencial a pousadas, restaurantes e lojas do centro', metaEstimada: '5–8 leads em 4 semanas', gatilho: '750 novas empresas abertas em Teresópolis em 2024 — pool não abordado' };
}

async function avaliarAcidentes(mes) {
  const score = Math.min(100, 22 + sazonal('acidentes', mes));
  const g = mes===7?'Férias escolares — pico de trilhas e esportes de aventura':'Parque Nacional da Serra dos Órgãos — atividades de risco todo fim de semana';
  return { produto: 'acidentes', label: 'Acidentes Pessoais', score, confianca: 'baixa', confianca_percentual: 45, receita_potencial: calcReceita('acidentes', score), ticket_medio: FINANCEIRO.acidentes.ticket_mensal, taxa_conversao: FINANCEIRO.acidentes.taxa_conversao, sinais: ['Capital do montanhismo do RJ — guias raramente segurados', 'PARNASO: escalada, rapel, trilha todos os fins de semana', 'Trabalhadores da construção civil sem cobertura patronal'], volume: '~5.000 praticantes de aventura estimados', perfil_cliente: PERFIS.acidentes, acoes_recomendadas: ACOES.acidentes, planosIndicados: ['Acidentes Pessoais (via seguradora parceira)'], mensagemPronta: 'Guia de trilha, escalador ou ativo? Acidentes pessoais a partir de R$20/mês.', acaoRecomendada: 'Parceria com lojas de equipamentos outdoor e instrutores do PARNASO', metaEstimada: '6–10 leads em 4 semanas', gatilho: g };
}

async function avaliarViagem(mes, cambio) {
  let bonusCambio = 0, gatilhoCambio = '';
  if (cambio) {
    if (cambio.valor >= 6.00)  { bonusCambio = 15; gatilhoCambio = `Dólar R$${cambio.valor.toFixed(2)} — viagem cara, mais razão para segurar`; }
    else if (cambio.valor >= 5.50) { bonusCambio = 8; gatilhoCambio = `Dólar R$${cambio.valor.toFixed(2)}`; }
  }
  const score = Math.min(100, 18 + bonusCambio + sazonal('viagem', mes));
  return { produto: 'viagem', label: 'Seguro Viagem', score, confianca: cambio?.fonte==='bcb_ptax'?'alta':'media', confianca_percentual: cambio?.fonte==='bcb_ptax'?88:65, receita_potencial: calcReceita('viagem', score), ticket_medio: FINANCEIRO.viagem.ticket_mensal, taxa_conversao: FINANCEIRO.viagem.taxa_conversao, sinais: [cambio?`Câmbio USD: R$${cambio.valor.toFixed(2)} (BACEN)`:'Câmbio estimado', 'Moradores viajam para Europa jun–set e EUA em dez', 'Turistas chegando — parceria com hotéis'], volume: '~3.000–5.000 viagens/ano estimadas', perfil_cliente: PERFIS.viagem, acoes_recomendadas: ACOES.viagem, planosIndicados: ['Seguro Viagem (via seguradora parceira)'], mensagemPronta: 'Viajando nas férias? Seguro viagem a partir de R$15 para destinos nacionais.', acaoRecomendada: mes===6||mes===7?'Campanha férias de julho + agências de viagem':'Parceria com hotéis e pousadas', metaEstimada: '8–15 leads em 2 semanas', gatilho: gatilhoCambio || (mes>=6&&mes<=7?'Férias escolares de julho — pico de viagens':'Sazonalidade de viagens') };
}

async function avaliarRC(mes) {
  const score = Math.min(100, 18 + sazonal('rc', mes));
  return { produto: 'rc', label: 'Responsabilidade Civil', score, confianca: 'baixa', confianca_percentual: 45, receita_potencial: calcReceita('rc', score), ticket_medio: FINANCEIRO.rc.ticket_mensal, taxa_conversao: FINANCEIRO.rc.taxa_conversao, sinais: ['Guias de aventura e síndicos raramente têm RC', 'CNPJs de serviços profissionais (CNAE 69–75) abertos em 2024', 'Sem API pública — estimativa'], volume: '~2.000 profissionais liberais estimados', perfil_cliente: PERFIS.rc, acoes_recomendadas: ACOES.rc, planosIndicados: ['RC Profissional (via seguradora parceira)'], mensagemPronta: 'Profissional liberal? Uma ação judicial pode custar caro. RC profissional te protege.', acaoRecomendada: 'Abordagem a conselhos profissionais locais e operadores de aventura', metaEstimada: '4–8 leads em 4 semanas', gatilho: 'Profissionais liberais e operadores de aventura com alta exposição de RC sem cobertura' };
}

async function avaliarOdonto(mes) {
  const score = Math.min(100, 20 + sazonal('odonto', mes));
  return { produto: 'odonto', label: 'Plano Odontológico', score, confianca: 'baixa', confianca_percentual: 45, receita_potencial: calcReceita('odonto', score), ticket_medio: FINANCEIRO.odonto.ticket_mensal, taxa_conversao: FINANCEIRO.odonto.taxa_conversao, sinais: ['Gap odontológico 30–40% maior que saúde em municípios do interior (ANS)', 'Cross-sell: clientes Amil Bronze Adesão (dental vence em 12 meses)', 'Produto acessível — ticket menor que saúde'], volume: '~120.000 pessoas sem plano odontológico estimadas', perfil_cliente: PERFIS.odonto, acoes_recomendadas: ACOES.odonto, planosIndicados: ['Plano Odontológico (via operadora parceira)'], mensagemPronta: 'Seu plano de saúde não cobre dentista. Plano odontológico a partir de R$30/mês.', acaoRecomendada: 'Contato com clientes de adesão Amil Bronze ao 11º mês de contrato', metaEstimada: '10–20 leads em 4 semanas (cross-sell da base)', gatilho: 'Gap de cobertura odontológica 30–40% maior que saúde no interior' };
}

async function avaliarConsorcio(mes, selic) {
  let bonusSelic = 0, g = 'Alternativa ao financiamento bancário';
  if (selic) {
    if (selic.valor >= 14)  { bonusSelic = 35; g = `Selic ${selic.valor}% — financiamento caro, consórcio muito mais barato`; }
    else if (selic.valor >= 12) { bonusSelic = 20; g = `Selic ${selic.valor}% — financiamento caro`; }
    else { g = `Selic ${selic.valor}% — consórcio competitivo com financiamento`; }
  }
  const score = Math.min(100, 20 + bonusSelic + sazonal('consorcio', mes));
  return { produto: 'consorcio', label: 'Consórcio (imóvel/veículo)', score, confianca: selic?.fonte==='bcb'?'alta':'media', confianca_percentual: confPct(selic?.fonte==='bcb'?'alta':'media'), receita_potencial: calcReceita('consorcio', score), ticket_medio: FINANCEIRO.consorcio.ticket_mensal, taxa_conversao: FINANCEIRO.consorcio.taxa_conversao, sinais: [selic?`Taxa Selic atual: ${selic.valor}% a.a. (BACEN)`:'Taxa Selic estimada', 'Mercado de segunda residência ativo em Teresópolis', 'MEIs precisando de veículo de trabalho sem entrada'], volume: 'Faixa 28–45 anos: ~40.000 pessoas', perfil_cliente: PERFIS.consorcio, acoes_recomendadas: ACOES.consorcio, planosIndicados: ['Consórcio Imóvel', 'Consórcio Veículo', 'Consórcio Serviços (reforma)'], mensagemPronta: `Com Selic a ${selic?.valor||'?'}%, financiamento ficou caro. Consórcio: sem juros, só taxa de administração.`, acaoRecomendada: 'Abordagem a MEIs e autônomos + parceria com imobiliárias locais', metaEstimada: '8–12 leads em 4 semanas', gatilho: g };
}

async function avaliarPrevidencia(mes) {
  const score = Math.min(100, 22 + sazonal('previdencia', mes));
  const g = mes===3||mes===4?'Temporada IR — janela ideal para PGBL (dedução fiscal até 12% da renda)':mes===10||mes===11?'Planejamento de final de ano — última contribuição do exercício':'MEIs: INSS MEI garante apenas R$1.518/mês de aposentadoria';
  return { produto: 'previdencia', label: 'Previdência Privada (PGBL/VGBL)', score, confianca: 'media', confianca_percentual: 65, receita_potencial: calcReceita('previdencia', score), ticket_medio: FINANCEIRO.previdencia.ticket_mensal, taxa_conversao: FINANCEIRO.previdencia.taxa_conversao, sinais: ['MEI contributivo garante apenas R$1.518/mês de aposentadoria (2026)', 'Alta concentração de autônomos sem previdência complementar', mes===3||mes===4?'Prazo IR: PGBL até 30/abril':'Cross-sell crítico com saúde MEI'], volume: '~20.000 MEIs e autônomos sem previdência privada estimados', perfil_cliente: PERFIS.previdencia, acoes_recomendadas: ACOES.previdencia, planosIndicados: ['PGBL (declara IR completo)', 'VGBL (demais perfis)'], mensagemPronta: 'MEI: seu INSS garante só 1 salário mínimo de aposentadoria. Previdência privada completa o resto.', acaoRecomendada: mes===3||mes===4?'Campanha IR: PGBL reduz imposto e garante aposentadoria':'Abordar MEIs na conversa de saúde', metaEstimada: score>=50?'15–20 leads em 2 semanas':'8–12 leads em 4 semanas', gatilho: g };
}

async function sinalizadorBuscaOrganica() {
  try {
    const r = await search('plano de saúde Teresópolis', { num: 3 });
    const ok = r.results?.length > 0;
    return { score: ok ? 12 : 0, sinal: ok ? 'Busca orgânica ativa para "plano de saúde Teresópolis"' : 'Sem sinal de busca orgânica', fonte: r.provider };
  } catch { return { score: 0, sinal: 'Busca web indisponível', fonte: 'indisponível' }; }
}

// ─── Cross-sell por produto vencedor ─────────────────────────────────────────
const CROSSSELL_MAP = {
  saude_mei:    'MEI ativo: abordar saúde PME → previdência → RC profissional → consórcio veículo na mesma conversa.',
  saude_pf:     'PF sem plano: abordar saúde individual → seguro de vida → previdência → odontológico.',
  saude_adesao: 'Profissional liberal: abordar adesão → RC profissional → previdência → odontológico.',
  residencial:  'Proprietário: abordar residencial → seguro de vida → consórcio imóvel.',
  vida:         'Autônomo: abordar vida → previdência → acidentes pessoais.',
  consorcio:    'Consórcio imóvel: abordar residencial → vida → previdência na mesma conversa.',
  previdencia:  'Previdência: abordar junto com saúde MEI para autônomos — mesma visita.',
  auto:         'Auto: verificar se tem MEI (adicionar saúde PME) ou é autônomo (adicionar vida).',
  empresarial:  'Empresarial: oferecer saúde PME para funcionários + RC empresarial na mesma proposta.',
};

// ─── Scanner principal ────────────────────────────────────────────────────────
async function scan(cidade = 'Teresópolis') {
  const hoje = new Date(), mes = hoje.getMonth() + 1;

  const [selic, cambio, chuva, buscaOrg] = await Promise.all([fetchSelic(), fetchCambioUSD(), fetchChuvaINMET(), sinalizadorBuscaOrganica()]);

  const resultados = await Promise.all([
    avaliarSaudeMEI(mes), avaliarSaudePF(mes), avaliarSaudeAdesao(mes),
    avaliarResidencial(mes, chuva), avaliarVida(mes), avaliarAuto(mes),
    avaliarEmpresarial(mes), avaliarAcidentes(mes), avaliarViagem(mes, cambio),
    avaliarRC(mes), avaliarOdonto(mes), avaliarConsorcio(mes, selic), avaliarPrevidencia(mes)
  ]);

  // Adicionar fatores impulsionadores e sinal de busca orgânica
  resultados.forEach(r => {
    r.fatores_impulsionadores = buildFatores(r.produto, r.score, mes, { selic: selic?.valor, cambio: cambio?.valor, chuvaMM: chuva?.mm });
    if (r.produto.startsWith('saude')) {
      r.score = Math.min(100, r.score + buscaOrg.score);
      if (buscaOrg.score > 0) r.sinais.push(buscaOrg.sinal);
    }
  });

  resultados.sort((a, b) => b.score - a.score);

  const vencedor = resultados[0];
  const receitaTotal = resultados.reduce((s, r) => s + r.receita_potencial, 0);

  const proxVarredura = new Date(hoje);
  proxVarredura.setDate(proxVarredura.getDate() + 7);

  const fontes = ['brasil.io (MEI)', selic?.fonte==='bcb'?'bcb.gov.br (Selic)':null, cambio?.fonte==='bcb_ptax'?'bcb.gov.br (câmbio)':null, chuva?.fonte==='inmet'?'inmet.gov.br (chuva)':null, buscaOrg.fonte!=='indisponível'?buscaOrg.fonte:null, 'ANS 2024-Q3 (estimativas)', 'IBGE/SEBRAE (estimativas)'].filter(Boolean);

  return {
    dataVarredura: hoje.toISOString().slice(0, 10),
    cidade, scores: resultados,
    recomendacao: vencedor.produto,
    recomendacaoLabel: vencedor.label,
    mensagemCampanha: vencedor.mensagemPronta,
    crossSellAlerta: CROSSSELL_MAP[vencedor.produto] || `${vencedor.label} em alta — focar esforços comerciais esta semana.`,
    receitaTotalEstimada: receitaTotal,
    dadosAPI: { selic: selic?.valor, cambioUSD: cambio?.valor, chuvaMM: chuva?.mm ?? null },
    fontes,
    proximaVarredura: proxVarredura.toISOString().slice(0, 10)
  };
}

async function avaliarMEI() { return avaliarSaudeMEI(new Date().getMonth() + 1); }
async function avaliarPF()  { return avaliarSaudePF(new Date().getMonth() + 1); }
async function avaliarAdesao() { return avaliarSaudeAdesao(new Date().getMonth() + 1); }

module.exports = { scan, avaliarMEI, avaliarPF, avaliarAdesao };
