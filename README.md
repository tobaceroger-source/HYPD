# Traffic Hub

Primeira versão de uma central **pessoal** de tráfego: clientes, Google Ads, Meta Ads, GA4 e conversa com um analista.

Para continuar em outro ChatGPT ou no Codex, leia primeiro [CONTEXTO.md](CONTEXTO.md). Use [PROMPT-NOVO-CHAT.txt](PROMPT-NOVO-CHAT.txt) como mensagem inicial. O repositório de destino escolhido é `tobaceroger-source/HYPD`; o aplicativo se chama Traffic Hub e não depende do serviço HYPD.AI.

## Abrir a demonstração

Requer Node.js **24.15 ou superior**. Na pasta deste projeto:

```powershell
npm ci
npm run dev
```

Abra **http://localhost:4317**. Sem `.env`, o aplicativo abre em demonstração, com contas fictícias e respostas calculadas de exemplo. O modo demo não chama a IA e não autoriza plataformas reais. As fontes tipográficas são locais.

Experimente criar um cliente, abrir Conexões, vincular uma conta de exemplo sem vínculo, selecionar esse cliente e conversar no Analista. Os dados e as conversas ficam salvos em `data/demo.sqlite`.

## O que está implementado

- Cadastro e edição de clientes, tipo de negócio, verba de referência, objetivo e contexto.
- Conexão OAuth independente para Google Ads, Meta Ads e GA4.
- Google Ads: descoberta de anunciantes com acesso direto e por MCC, paginação e desempenho agregado por campanha.
- Meta: descoberta de contas ativas e Insights por campanha. `ads_read`; sem criação/edição de anúncios.
- GA4: descoberta de propriedades via Admin API e relatórios de sessões, eventos principais e receita de compras por origem/mídia da sessão via Data API.
- Vínculo de cada conta a um cliente; para transferir, desvincule primeiro.
- Comparação de 7, 14, 30 ou 90 dias completos com período anterior equivalente. O dia atual é excluído no fuso de cada conta.
- Conversas persistentes por cliente e filtro de período, com fonte e datas em cada resposta.
- Analista generativo via AI SDK e OpenAI ou AI Gateway. Recebe exclusivamente métricas e contexto do cliente selecionado.
- Tokens criptografados com AES-256-GCM no servidor, renovação Google e indicação de reconexão Meta quando expirada.
- Sessão pessoal, proteção de origem/CSRF, validação de entradas e limitação de tentativas de login.

## Ativar dados reais

Copie `.env.example` para `.env`, preencha os campos e reinicie o servidor. Não envie segredos pelo chat nem os coloque em arquivos do frontend.

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use o valor gerado em `APP_SECRET`, defina `ADMIN_PASSWORD` com pelo menos 12 caracteres e altere `APP_MODE=live`. O modo real usa **outro banco**, `data/live.sqlite`, inicialmente vazio. O acesso exige a senha definida. Uma chave consistente é necessária para abrir tokens salvos; perder ou trocar APP_SECRET exige reconectar as plataformas.

### Google Ads e GA4

1. Crie ou reutilize um projeto no Google Cloud com um cliente OAuth do tipo **Aplicativo da Web** e uma tela de consentimento apropriada. Se estiver em teste, inclua seu usuário autorizado.
2. Ative **Google Ads API**, **Google Analytics Admin API** e **Google Analytics Data API**.
3. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
4. Para Ads, configure também `GOOGLE_ADS_DEVELOPER_TOKEN` com o nível de acesso adequado. Credenciais OAuth sozinhas não liberam consultas Ads em produção.
5. Cadastre exatamente os retornos:

```text
http://localhost:4317/api/oauth/google_ads/callback
http://localhost:4317/api/oauth/ga4/callback
```

Google Ads solicita o escopo `adwords`, que é o escopo oficial da API; esta aplicação disponibiliza apenas consultas. GA4 solicita `analytics.readonly`. As duas conexões são autorizadas separadamente. Para MCC, a API lista a hierarquia e preserva o `login-customer-id` correto nas consultas.

### Meta Ads

1. Configure seu aplicativo no Meta for Developers com o fluxo de login adequado ao acesso às suas contas de anúncios.
2. Preencha `META_APP_ID` e `META_APP_SECRET`. Se usar Facebook Login for Business, preencha `META_LOGIN_CONFIG_ID` com sua configuração publicada.
3. Habilite os acessos necessários a `ads_read` para os ativos e usuários que você gerencia. Disponibilidade e revisão dependem do aplicativo e das contas.
4. Cadastre o retorno exato:

```text
http://localhost:4317/api/oauth/meta/callback
```

O servidor troca o código por um token e solicita a troca por token de maior duração. Tokens Meta expirados exigem nova autorização. O app não pede permissão para publicar anúncios. A consulta de insights usa a atribuição configurada nos conjuntos.

### Analista com IA

Configure **uma** opção:

- `OPENAI_API_KEY` e, se necessário, `AI_MODEL` (padrão `gpt-5.4-mini`); ou
- `AI_GATEWAY_API_KEY` e `AI_GATEWAY_MODEL` (padrão `openai/gpt-5.4-mini`).

São credenciais de API, com cobrança conforme uso. A assinatura do ChatGPT não configura automaticamente a API deste aplicativo. Sem chave, você ainda pode conectar plataformas e visualizar métricas; a conversa generativa informará a configuração pendente.

O analista recebe totais e até 60 linhas com maior investimento ou sessões de cada conta, além do contexto e das últimas 12 mensagens da mesma conversa. A cobertura é informada ao modelo. Regras analíticas ficam em `server/analyst.mjs` e podem ser ajustadas.

## Limites desta primeira versão

- **Conectores e chamadas estão implementados, mas não foram validados com contas reais nesta entrega**, pois as credenciais do seu aplicativo não foram fornecidas. Os testes usam respostas simuladas das APIs oficiais; não substituem a autorização e conferência de uma conta piloto.
- A conversa da demonstração usa respostas de exemplo, não uma IA generativa. A chamada real ao modelo depende da chave e também não foi executada nesta entrega.
- Consultas são sob demanda, com cache de 60 segundos. Atualizar dados força nova consulta. Não há sincronização agendada.
- O analista não consulta termos de pesquisa, criativos, pixels, histórico de alterações, concorrência, CRM ou pedidos pagos nesta versão. Não consegue executar uma auditoria completa desses itens com o conjunto atual de ferramentas.
- Google: resultados são as conversões configuradas na plataforma; não há separação por ação de conversão nesta versão.
- Meta: geração de leads usa **somente `lead`**, sem somar mensagens. E-commerce usa `omni_purchase`, com `purchase` apenas como fallback. Se a conta otimiza para outro evento, o total exibido pode ser zero e exige adaptação do mapeamento.
- GA4: eventos principais e receita de compras são os registros do Analytics, sujeitos à implementação. Não comprovam pagamento ou qualificação. Sessões não são usuários únicos.
- Métricas monetárias não são somadas entre moedas distintas. Receitas Google e Meta não são somadas como faturamento. Os intervalos de cada fonte respeitam seu fuso, podendo ter diferenças em relação ao filtro de referência em São Paulo.
- Falhas de acesso ficam explícitas como dados parciais. Paginações Ads e Meta são percorridas; GA4 rejeita relatórios acima de 10 mil linhas para não apresentar totais incompletos.
- Remover conexão apaga tokens e vínculos locais; revogue a autorização também na plataforma se desejar encerrar a concessão externa. Conversas antigas e suas evidências são preservadas.
- Não há MCP remoto, cobrança, equipes ou publicação em hospedagem. É um app pessoal com uma senha e banco local.

## Compilar, testar e executar

```powershell
npm run check
npm run start
```

`check` compila TypeScript/frontend e executa os testes de API, cálculo, criptografia, CSRF, OAuth, isolamento de clientes e formatos dos conectores. `start` serve a compilação com o mesmo backend. `npm run dev` oferece atualização da interface durante o desenvolvimento; reinicie após mudar arquivos do servidor ou o `.env`.

Em uma hospedagem, use um processo Node persistente, HTTPS, volume persistente para `data/`, `APP_URL` com o endereço público e `HOST=0.0.0.0`. Cadastre os mesmos callbacks com o novo domínio. Faça cópias consistentes do banco SQLite e preserve APP_SECRET separadamente. Esta entrega não publicou o app nem configurou infraestrutura externa.

## Estrutura

```text
src/                  Interface React, TypeScript e CSS responsivo
server/app.mjs        API pessoal, sessões, clientes, OAuth e conversas
server/connectors.mjs Google Ads, Meta e GA4
server/metrics.mjs    Períodos, métricas e dados demonstrativos
server/analyst.mjs    Regras analíticas e integração com o modelo
server/store.mjs      Persistência SQLite e criptografia
tests/                Verificações de comportamento e contratos das APIs
```

## Referências das integrações

- [Google Ads: autenticação](https://developers.google.com/google-ads/api/docs/oauth/overview)
- [Google Ads: hierarquia MCC](https://developers.google.com/google-ads/api/docs/account-management/get-account-hierarchy)
- [GA4: Admin API](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
- [GA4: Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
- [Meta: Insights](https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights)
- [Meta: fluxo de login](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow)
- [Meta: tokens de maior duração](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived)
- [AI SDK](https://ai-sdk.dev/docs)

Não depende de HYPD ou Higgsfield. Interface e regras analíticas são próprias.
