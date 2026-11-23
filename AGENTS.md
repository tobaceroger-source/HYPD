# Instruções do projeto

- Não usar Higgsfield, suas ferramentas, plugins ou fluxos de produção; o usuário solicitou sua remoção em 15/10/2026. Não reinstalar nem reconectar o serviço.
- Leia `CONTEXTO.md` e `README.md` antes de continuar. Preserve a distinção entre demonstração e validação com dados reais.
- Esta etapa é um app pessoal, com Google Ads, Meta e GA4 em consulta. Não modificar campanhas nem enviar mensagens a clientes sem instrução específica.
- Não versionar `.env`, tokens, chaves, sessões ou bancos de dados locais. `.env.example` deve ter apenas valores vazios ou exemplos públicos.
- Use `npm ci` e `npm run check` para instalar e validar no ambiente de destino; não pressupor que os testes continuam passando ou que uma API externa está autorizada.
- Prefira português brasileiro na interface e nas explicações. O cliente piloto escolhido é Spazio Italiano; confirme as identidades das contas antes de vincular.
