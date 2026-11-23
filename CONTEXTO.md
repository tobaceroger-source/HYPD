# Contexto para continuar o Traffic Hub

Atualizado em 23/11/2026. Este documento resume o estado da entrega; não substitui inspeção do código nem validação atual das plataformas.

## Objetivo do proprietário

Construir uma ferramenta de uso pessoal para um gestor de tráfego brasileiro, inspirada nas funcionalidades públicas do HYPD.AI: conectar fontes, organizar contas por cliente e conversar com um analista orientado por dados. A primeira versão contempla Google Ads, Meta Ads e GA4. O cliente piloto escolhido é **Galileu Senior**.

O usuário prefere uma interface intuitiva e comunicação em português. Não precisa de cobrança, planos ou equipes nesta etapa. Ações em campanhas não foram solicitadas; os conectores implementados são de consulta.

## Estado real

- Aplicativo implementado em React + TypeScript + Vite, backend Express/Node e SQLite nativo do Node 24.15+.
- Há fluxo OAuth, descoberta de contas, vínculo ao cliente e consultas de campanhas ou origem/mídia.
- A análise generativa usa AI SDK com OpenAI ou AI Gateway. As instruções estão em `server/analyst.mjs`.
- Sem configuração, abre em demonstração com dados fictícios e respostas calculadas. O demo não usa IA generativa nem autoriza plataformas reais.
- Em 23/11/2026 a compilação e os 19 testes passaram novamente antes do envio ao GitHub. Cadastro, vínculo, resposta demonstrativa e persistência foram conferidos no navegador em 19/11, incluindo versões móveis de 390 e 320 pixels. Execute novamente as verificações no ambiente de destino.
- **Nenhuma conta real foi conectada ao Traffic Hub e nenhuma chamada real à IA foi validada.** Não confundir as consultas pelos conectores do Codex com autorização do app próprio.
- Na conferência de 23/11/2026, a pasta do app não tinha arquivo `.env` nem repositório Git inicializado.
- Nenhuma hospedagem pública foi configurada. O endereço `http://localhost:4317` depende de um servidor rodando no computador de origem e não é um endereço público.
- O pacote de transferência exclui bancos locais, sessões, tokens, dados de clientes, `.env`, `node_modules` e `dist`.

## Entradas principais

| Arquivo | Papel |
| --- | --- |
| `README.md` | Instalação, funcionamento e limites |
| `.env.example` | Nomes das variáveis, sem segredos |
| `server/index.mjs` | Inicialização e separação demo/live |
| `server/app.mjs` | Sessões, clientes, vínculo, OAuth, relatórios e conversas |
| `server/connectors.mjs` | Autorização e chamadas às três plataformas |
| `server/metrics.mjs` | Datas, normalização e dados fictícios |
| `server/analyst.mjs` | Regras analíticas e geração de resposta |
| `server/store.mjs` | Persistência e criptografia AES-256-GCM |
| `src/App.tsx` | Interface e fluxos de uso |
| `tests/` | 19 testes na entrega de 19/11 |

## Para testar em outro ambiente

```powershell
npm ci
npm run check
npm run dev
```

Abra `http://localhost:4317` no mesmo ambiente em que o servidor está acessível. Para servir a compilação, use `npm run build` e `npm start`.

## Próximo trabalho solicitado

Configurar as conexões reais e a IA, selecionar as contas corretas do Galileu Senior e validar um relatório e uma resposta usando dados reais. Essa configuração foi adiada pelo usuário e ainda não foi executada.

1. Verificar versões, documentação oficial e requisitos das APIs antes de configurar credenciais.
2. Ajustar os requisitos do conector Google Ads: o código inicial ainda exige `GOOGLE_ADS_DEVELOPER_TOKEN`. A [documentação oficial consultada em 19/11](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) informou que os tokens foram descontinuados em 09/09/2026 e que o acesso é gerenciado no projeto Cloud. Revalidar e corrigir essa exigência antes de orientar a configuração. A troca anterior terminou antes dessa correção.
3. Criar ou reutilizar credenciais próprias do app e configurar callbacks para o ambiente escolhido. Não extrair tokens gerenciados pelo ChatGPT/Codex para reutilizá-los neste servidor.
4. Configurar `APP_SECRET`, senha pessoal, modo live e credencial da IA localmente, sem colocar valores no chat, GitHub ou frontend. Criar chaves ou contratar créditos pode exigir participação do usuário.
5. Autorizar cada plataforma, descobrir as contas e conferir nome/ID/moeda/fuso antes de vinculá-las ao piloto. Os acessos observados nos conectores do Codex em 19/11 são apenas referências históricas, não prova de acesso atual.
6. Na Meta, existem contas distintas com nomes relacionados a Galileu e Casarão. A consulta de 19/11 mostrou a conta de nome exato Galileu Senior desabilitada e uma conta chamada GALILEU - CAMPANHAS ativa. Confirmar com dados atuais e com o usuário qual conta representa a mídia comercial do piloto. Manter recrutamento separado.
7. Comparar métricas com cada plataforma no mesmo período. Conferir o evento de resultado, principalmente na Meta: o mapeamento atual usa `lead` para geração de leads; campanhas de mensagens podem exigir outro tratamento.
8. Enviar uma pergunta ao analista e verificar que usa somente as fontes do cliente e apresenta datas, definições, limitações e evidências.

## Regras analíticas

- Conversão atribuída, evento principal GA4, conversa, lead qualificado e venda são etapas diferentes.
- Não somar receitas atribuídas de Google e Meta como faturamento.
- Não somar moedas diferentes; ausência de acesso não é resultado zero.
- Comparar períodos completos e considerar fuso e atraso de conversão.
- Separar fato observado de hipótese e recomendação. O app não executa alterações de campanha.
- Nesta versão, as ferramentas de análise não consultam criativos, termos, rastreamento, histórico de alterações, CRM ou pagamentos confirmados. Não apresentar uma auditoria completa desses itens como executada.

## Transferência para ChatGPT

O usuário escolheu o repositório privado `https://github.com/tobaceroger-source/HYPD` para receber o código e este contexto. O nome do aplicativo é Traffic Hub; não é o código proprietário do HYPD.AI.

O repositório transporta código e documentação. O histórico integral desta conversa, credenciais, acessos externos e processos locais não são transferidos automaticamente. O outro ChatGPT precisa de acesso ao repositório e deve começar por este documento.

O app GitHub no ChatGPT permite consultar conteúdo autorizado; para executar testes e continuar alterando o projeto é necessário um ambiente de execução/desenvolvimento, como Codex ou um computador com Node. Para usar a interface de outro computador, é preciso executar o projeto nesse computador ou hospedá-lo com backend e armazenamento persistente.
