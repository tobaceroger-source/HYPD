import test from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import {
  accessToken,
  discoverAccounts,
  queryAccount,
} from "../server/connectors.mjs";
const env = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token",
  GOOGLE_ADS_API_VERSION: "v26",
  META_APP_SECRET: "meta-secret",
  META_API_VERSION: "v27.0",
};
const range = {
  start: "2026-11-01",
  end: "2026-11-07",
  previousStart: "2026-10-25",
  previousEnd: "2026-10-31",
};
const response = (data) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
test("renovação concorrente do Google usa uma troca e preserva refresh_token criptografado", async () => {
  const original = global.fetch,
    store = openStore(":memory:", "secret");
  let calls = 0;
  const connection = store.put("connections", {
    id: "c",
    provider: "ga4",
    secret: store.encrypt({
      access_token: "old",
      refresh_token: "refresh",
      expires_at: 0,
    }),
  });
  global.fetch = async (url, opts) => {
    calls++;
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    assert.equal(opts.body.get("refresh_token"), "refresh");
    return response({ access_token: "renewed", expires_in: 3600 });
  };
  try {
    const tokens = await Promise.all([
      accessToken(connection, store, env),
      accessToken(connection, store, env),
    ]);
    assert.deepEqual(tokens, ["renewed", "renewed"]);
    assert.equal(calls, 1);
    assert.equal(
      store.decrypt(store.get("connections", "c").secret).refresh_token,
      "refresh",
    );
  } finally {
    global.fetch = original;
    store.db.close();
  }
});
test("descoberta Google percorre MCC e mantém identidade e fuso de cada anunciante", async () => {
  const original = global.fetch;
  const seen = [];
  global.fetch = async (url, opts) => {
    seen.push({ url: String(url), opts });
    if (String(url).endsWith(":listAccessibleCustomers"))
      return response({ resourceNames: ["customers/1234567890"] });
    assert.equal(opts.headers["login-customer-id"], "1234567890");
    return response({
      results: [
        {
          customerClient: {
            id: "1234567890",
            manager: true,
            status: "ENABLED",
          },
        },
        {
          customerClient: {
            id: "2345678901",
            manager: false,
            status: "ENABLED",
            descriptiveName: "Cliente A",
            currencyCode: "BRL",
            timeZone: "America/Sao_Paulo",
          },
        },
      ],
    });
  };
  try {
    const accounts = await discoverAccounts("google_ads", "access", env);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].managerId, "1234567890");
    assert.equal(accounts[0].externalId, "2345678901");
    assert.equal(seen.length, 2);
  } finally {
    global.fetch = original;
  }
});
test("consulta Google usa a conta vinculada, período e paginação e converte micros", async () => {
  const original = global.fetch,
    store = openStore(":memory:", "secret");
  const c = store.put("connections", {
    id: "c",
    provider: "google_ads",
    secret: store.encrypt({
      access_token: "access",
      expires_at: Date.now() + 3600000,
    }),
  });
  let calls = 0;
  global.fetch = async (url, opts) => {
    calls++;
    assert.match(String(url), /customers\/2345678901\/googleAds:search$/);
    assert.equal(opts.headers["login-customer-id"], "1234567890");
    const b = JSON.parse(opts.body);
    assert.match(b.query, /2026-(11-01|10-25)/);
    return response({
      results: [
        {
          campaign: { id: "1", name: "Campanha" },
          metrics: {
            costMicros: "2000000",
            impressions: "100",
            clicks: "10",
            conversions: "2",
            conversionsValue: "20",
          },
        },
      ],
      ...(b.pageToken ? {} : { nextPageToken: "page-2" }),
    });
  };
  try {
    const data = await queryAccount(
      {
        provider: "google_ads",
        externalId: "2345678901",
        managerId: "1234567890",
      },
      c,
      { business: "leadgen" },
      range,
      store,
      env,
    );
    assert.equal(data.totals.spend, 4);
    assert.equal(data.totals.conversions, 4);
    assert.equal(calls, 4);
  } finally {
    global.fetch = original;
    store.db.close();
  }
});
test("consulta GA4 preserva eventos principais e receita como métricas distintas", async () => {
  const original = global.fetch,
    store = openStore(":memory:", "secret");
  const c = store.put("connections", {
    id: "c",
    provider: "ga4",
    secret: store.encrypt({
      access_token: "access",
      expires_at: Date.now() + 3600000,
    }),
  });
  global.fetch = async (url, opts) => {
    assert.match(String(url), /properties\/12345:runReport$/);
    const b = JSON.parse(opts.body);
    assert.deepEqual(
      b.metrics.map((x) => x.name),
      ["sessions", "keyEvents", "purchaseRevenue"],
    );
    return response({
      rowCount: 1,
      rows: [
        {
          dimensionValues: [{ value: "google / cpc" }],
          metricValues: [{ value: "20" }, { value: "3" }, { value: "100" }],
        },
      ],
    });
  };
  try {
    const data = await queryAccount(
      { provider: "ga4", externalId: "12345" },
      c,
      {},
      range,
      store,
      env,
    );
    assert.equal(data.totals.sessions, 20);
    assert.equal(data.totals.keyEvents, 3);
    assert.equal(data.totals.revenue, 100);
    assert.equal(data.totals.spend, undefined);
  } finally {
    global.fetch = original;
    store.db.close();
  }
});
test("consulta Meta usa token em header, prova do app e evento adequado", async () => {
  const original = global.fetch,
    store = openStore(":memory:", "secret");
  const c = store.put("connections", {
    id: "c",
    provider: "meta",
    secret: store.encrypt({
      access_token: "access",
      expires_at: Date.now() + 3600000,
    }),
  });
  global.fetch = async (url, opts) => {
    const u = new URL(url);
    assert.match(u.pathname, /act_123\/insights$/);
    assert.equal(u.searchParams.get("access_token"), null);
    assert.ok(u.searchParams.get("appsecret_proof"));
    assert.equal(opts.headers.Authorization, "Bearer access");
    return response({
      data: [
        {
          campaign_id: "1",
          campaign_name: "Teste",
          spend: "20",
          inline_link_clicks: "8",
          actions: [
            { action_type: "lead", value: "2" },
            {
              action_type:
                "onsite_conversion.messaging_conversation_started_7d",
              value: "10",
            },
          ],
        },
      ],
    });
  };
  try {
    const data = await queryAccount(
      { provider: "meta", externalId: "act_123" },
      c,
      { business: "leadgen" },
      range,
      store,
      env,
    );
    assert.equal(data.totals.conversions, 2);
    assert.equal(data.totals.clicks, 8);
  } finally {
    global.fetch = original;
    store.db.close();
  }
});
