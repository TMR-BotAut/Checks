# ✅ Checklist Interativa — Handover, Onboarding & Closure

Aplicação web de **página única** (single-file) para conduzir e documentar os
três momentos críticos do ciclo de vida de um projeto ou de um membro de
equipe: a **entrega** (Handover), a **integração** (Onboarding) e o
**encerramento** (Closure).

Toda a interface foi desenhada com **foco em acessibilidade**, especialmente
para pessoas com TDAH: passos curtos e objetivos, progresso sempre visível,
tema escuro de baixo contraste de fadiga e fonte legível (OpenDyslexic).

🔗 **Acesso:** https://tmr-botaut.github.io/Checks/

---

## 🎯 Para que serve

Cada template é uma checklist estruturada em **3 fases** e **6 seções**,
cobrindo desde a documentação de negócio até o fechamento formal:

| Template | Ícone | Quando usar | Foco |
|----------|:-----:|-------------|------|
| **Handover** | 🔄 | Entrega de um projeto a outra pessoa/time | Documentação, infraestrutura e transferência de conhecimento |
| **Onboarding** | 🚀 | Integração de um novo membro | Ambiente, contexto, treinamento e primeiras atribuições |
| **Closure** | 🏁 | Saída de uma pessoa do projeto | Documentação final, passagem de responsabilidades e segurança |

Cada template organiza o trabalho em três fases sequenciais — por exemplo, no
Handover: **Pré-Projeto → Entrega → Pós-Entrega**.

---

## ✨ Funcionalidades

- **3 templates prontos** com mais de 100 itens de verificação no total.
- **Marcação de progresso** com barra geral e contador por seção, atualizados
  em tempo real.
- **Edição livre**: editar (✏️), remover (🗑) e **adicionar** novos itens em
  qualquer seção, sem limites.
- **Persistência local**: tudo é salvo automaticamente no `localStorage` do
  navegador — fecha e reabre que o progresso continua lá (por template).
- **Exportação para PDF** profissional (jsPDF), com a opção de gerar o
  documento **completo** ou apenas **uma fase** específica.
- **Identificação do projeto**: nome e data ficam registrados no cabeçalho e
  no PDF gerado.
- **100% offline depois de carregada** e responsiva (desktop e mobile).

---

## ♿ Acessibilidade (foco em TDAH)

A página foi construída a partir de princípios de design acessível:

- **Fonte OpenDyslexic** para reduzir a troca/confusão de letras.
- **Tema escuro** com contraste calibrado para reduzir cansaço visual.
- **Carga cognitiva baixa**: uma ação por vez, itens curtos, divisão em fases.
- **Feedback imediato**: barra de progresso, contadores e *toasts* de
  confirmação a cada ação.
- **Cores por fase** (azul / verde / roxo) para orientação visual rápida.
- **Alvos de toque generosos** (checkboxes de 24px) e navegação por teclado
  (Enter para adicionar/editar itens, Esc para cancelar a edição).

---

## 🚀 Como usar

1. Acesse a página e escolha um **template** no menu lateral (Handover,
   Onboarding ou Closure).
2. Preencha o **Nome do Projeto / Sistema** no cabeçalho.
3. Vá **marcando os itens** conforme conclui cada etapa. A barra de progresso
   acompanha você.
4. **Personalize** à vontade: edite textos, remova o que não se aplica e
   adicione itens próprios.
5. Ao finalizar (ou a qualquer momento), clique em **⬇ Exportar PDF** e escolha
   se quer o relatório completo ou de uma fase específica.

> 💾 O progresso é salvo automaticamente no seu navegador. Para começar do zero,
> limpe os dados do site no navegador.

---

## 🛠️ Detalhes técnicos

- **Stack:** HTML + CSS + JavaScript puro (*vanilla*), em **um único arquivo**
  (`index.html`) — sem build, sem dependências de servidor.
- **Bibliotecas externas (via CDN):**
  - [jsPDF](https://github.com/parallax/jsPDF) — geração do PDF.
  - [OpenDyslexic](https://opendyslexic.org/) — fonte acessível.
- **Armazenamento:** `localStorage` (chave `checklist_v2`), separado por
  template, incluindo itens personalizados e estado de cada checkbox.
- **Hospedagem:** GitHub Pages, servindo a partir do branch `main` (raiz).
- **Favicon:** SVG inline gerado por script (sem arquivo externo).

### Estrutura do projeto

```
Checks/
├── index.html   # a aplicação completa (UI + lógica + estilos)
└── README.md    # esta documentação
```

### Rodar localmente

Por ser um arquivo único e estático, basta abrir o `index.html` no navegador —
ou servir a pasta com qualquer servidor estático:

```bash
# opção 1: abrir direto
xdg-open index.html        # Linux  (use 'open' no macOS)

# opção 2: servidor local
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

---

## 📄 Sobre o PDF gerado

O relatório exportado é otimizado para impressão/arquivo:

- Tema claro, cabeçalho com nome do projeto, template e data em todas as
  páginas, e numeração de páginas no rodapé.
- Resumo de progresso (percentual e itens concluídos).
- Quebra de página inteligente: evita "órfãos" — banners de fase e títulos de
  seção não ficam sozinhos no fim da página; seções longas continuam na página
  seguinte com aviso de *continuação*.
- Nome do arquivo automático: `NomeProjeto_Template[_FaseN]_DDMM.pdf`.

---

<p align="center"><sub>Desenvolvido com foco em acessibilidade.</sub></p>
