import test from "node:test";
import assert from "node:assert/strict";
import { analyze, demoAnalysis } from "../server/analyst.mjs";

test("demonstração usa somente as fontes vinculadas e inclui métricas GA4", () => {
  const base = {
    client: { name: "Cliente" },
    range: { start: "2026-11-01", end: "2026-11-07" },
  };
  const ga = demoAnalysis(
    {
      ...base,
      accounts: [
        {
          provider: "ga4",
          currency: "BRL",
          totals: { sessions: 100, keyEvents: 3, revenue: 50 },
          previous: {},
        },
      ],
    },
    "Analisar",
  );
  assert.match(ga, /100 sessões/);
  assert.ok(!ga.includes("Meta subiu"));
  assert.ok(!ga.includes("investidos"));
});

test("o SDK entrega a resposta e envia somente o contexto selecionado com cobertura declarada", async () => {
  const original = global.fetch;
  let request;
  const report = {
    client: { id: "a", name: "Cliente A", goal: "Gerar leads" },
    days: 30,
    range: { start: "2026-10-20", end: "2026-11-18" },
    errors: [],
    accounts: [
      {
        id: "ad-a",
        clientId: "a",
        provider: "google_ads",
        totals: { spend: 100, conversions: 5 },
        previous: { spend: 80, conversions: 4 },
        rows: Array.from({ length: 80 }, (_, i) => ({
          name: `Campanha ${i}`,
          spend: i,
        })),
        previousRows: [],
      },
    ],
  };
  global.fetch = async (url, opts) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    request = JSON.parse(opts.body);
    return new Response(
      JSON.stringify({
        id: "resp_test",
        object: "response",
        created_at: 1795000000,
        status: "completed",
        model: "gpt-5.4-mini",
        output: [
          {
            id: "msg_test",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "Análise do cliente A com evidências.",
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const result = await analyze(report, [], "Como foi o período?", {
      APP_MODE: "live",
      OPENAI_API_KEY: "fake-test-key",
    });
    assert.equal(result.text, "Análise do cliente A com evidências.");
    assert.equal(result.engine, "ai");
    const serialized = JSON.stringify(request);
    assert.match(serialized, /não são vendas|pedidos pagos|pagamento/);
    assert.match(serialized, /rowCoverage/);
    assert.match(serialized, /Cliente A/);
    assert.ok(!serialized.includes('Campanha 0"'));
    assert.equal(request.model, "gpt-5.4-mini");
  } finally {
    global.fetch = original;
  }
});

test("modo demo não chama a IA mesmo que exista chave configurada", async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("Não deveria chamar a API.");
  };
  try {
    const r = await analyze(
      {
        accounts: [],
        client: { name: "Teste" },
        range: { start: "2026-11-01", end: "2026-11-07" },
      },
      [],
      "Olá",
      { APP_MODE: "demo", OPENAI_API_KEY: "fake" },
    );
    assert.equal(r.engine, "demo");
    assert.match(r.text, /demonstração|Demonstração/);
  } finally {
    global.fetch = original;
  }
});
