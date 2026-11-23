import test from "node:test";
import assert from "node:assert/strict";
import { openStore, seedDemo } from "../server/store.mjs";
import { dateRange, parseMeta, summarize } from "../server/metrics.mjs";
import { createApp } from "../server/app.mjs";
import { oauthUrl } from "../server/connectors.mjs";

const origin = "http://localhost:4317";
async function fixture(mode = "demo", extra = {}) {
  const store = openStore(
    ":memory:",
    "test-secret-that-is-at-least-32-characters",
  );
  if (mode === "demo") seedDemo(store);
  const env = {
    APP_MODE: mode,
    APP_URL: origin,
    ADMIN_PASSWORD: mode === "live" ? "a-secure-test-password" : "",
    ...extra.env,
  };
  const app = createApp({ ...extra, store, env });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  return {
    store,
    env,
    async request(path, body, options = {}) {
      const r = await fetch(base + "/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          ...options.headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...options,
        redirect: "manual",
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      let data;
      try {
        data = await r.json();
      } catch {}
      if (data?.csrf) csrf = data.csrf;
      return { status: r.status, data, headers: r.headers };
    },
    async close() {
      await new Promise((r) => server.close(r));
      store.db.close();
    },
  };
}
test("períodos completos têm o mesmo número de dias e respeitam o fuso", () => {
  const r = dateRange(7, new Date("2026-03-01T01:00:00Z"), "America/Sao_Paulo");
  assert.deepEqual(r, {
    start: "2026-02-21",
    end: "2026-02-27",
    previousStart: "2026-02-14",
    previousEnd: "2026-02-20",
    timezone: "America/Sao_Paulo",
  });
});
test("Meta escolhe um evento e não soma aliases sobrepostos", () => {
  const rows = [
    {
      campaign_name: "Teste",
      spend: "100",
      actions: [
        { action_type: "omni_purchase", value: "4" },
        { action_type: "purchase", value: "4" },
        { action_type: "lead", value: "3" },
        {
          action_type: "onsite_conversion.messaging_conversation_started_7d",
          value: "8",
        },
      ],
      action_values: [
        { action_type: "omni_purchase", value: "400" },
        { action_type: "purchase", value: "400" },
      ],
    },
  ];
  assert.equal(parseMeta(rows, "ecommerce")[0].conversions, 4);
  assert.equal(parseMeta(rows, "ecommerce")[0].value, 400);
  assert.equal(parseMeta(rows, "leadgen")[0].conversions, 3);
  assert.equal(summarize([{ spend: 100, conversions: 0 }]).cpa, null);
});
test("segredos são criptografados e adulteração é rejeitada", () => {
  const s = openStore(":memory:", "test-key");
  const encrypted = s.encrypt({ refresh_token: "sensitive-token" });
  assert.ok(!encrypted.includes("sensitive-token"));
  assert.equal(s.decrypt(encrypted).refresh_token, "sensitive-token");
  assert.throws(() => s.decrypt(encrypted.slice(0, -8) + "aaaaaaaa"));
  s.db.close();
});
test("bootstrap não expõe tokens e não inicia OAuth no modo demo", async () => {
  const f = await fixture();
  try {
    f.store.put("connections", {
      id: "private",
      provider: "ga4",
      secret: "must-not-leak",
      label: "Test",
    });
    const b = await f.request("/bootstrap");
    assert.equal(b.status, 200);
    assert.ok(!JSON.stringify(b.data).includes("must-not-leak"));
    assert.equal((await f.request("/oauth/ga4/start", {})).status, 409);
  } finally {
    await f.close();
  }
});
test("proteções de origem e CSRF bloqueiam mutações", async () => {
  const f = await fixture();
  try {
    await f.request("/bootstrap");
    assert.equal(
      (
        await f.request(
          "/clients",
          {},
          { headers: { Origin: "https://attacker.example" } },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          "/clients",
          {},
          {
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "X-CSRF-Token": "wrong",
            },
          },
        )
      ).status,
      403,
    );
  } finally {
    await f.close();
  }
});
test("modo real exige login e uma senha inválida não autentica", async () => {
  const f = await fixture("live");
  try {
    assert.equal((await f.request("/bootstrap")).status, 401);
    assert.equal(
      (await f.request("/login", { password: "wrong" })).status,
      401,
    );
    assert.equal(
      (await f.request("/login", { password: "a-secure-test-password" }))
        .status,
      200,
    );
    assert.equal((await f.request("/bootstrap")).status, 200);
  } finally {
    await f.close();
  }
});
test("vínculos validam cliente e impedem transferência silenciosa", async () => {
  const f = await fixture();
  try {
    await f.request("/bootstrap");
    assert.equal(
      (
        await f.request("/accounts/google_ads-aurora/link", {
          clientId: "missing",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request("/accounts/google_ads-aurora/link", {
          clientId: "atelier",
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.request("/accounts/google_ads-aurora/link", { clientId: null }))
        .status,
      200,
    );
    assert.equal(
      (
        await f.request("/accounts/google_ads-aurora/link", {
          clientId: "atelier",
        })
      ).status,
      200,
    );
  } finally {
    await f.close();
  }
});
test("conversas e dados ficam restritos ao cliente e ao período", async () => {
  const observed = [];
  const f = await fixture("demo", {
    analyzer: async (r, history) => {
      observed.push({ r, history });
      return { text: "Resposta de teste", engine: "test" };
    },
  });
  try {
    await f.request("/bootstrap");
    const sent = await f.request("/clients/aurora/chat", {
      message: "Como foi?",
      days: 30,
    });
    assert.equal(sent.status, 200);
    assert.ok(observed[0].r.accounts.every((a) => a.clientId === "aurora"));
    assert.equal(
      (await f.request("/clients/atelier/messages?days=30")).data.length,
      0,
    );
    assert.equal(
      (await f.request("/clients/aurora/messages?days=7")).data.length,
      0,
    );
    assert.equal(
      (await f.request("/clients/aurora/messages?days=30")).data.length,
      2,
    );
    assert.ok(sent.data.assistant.sources.length === 3);
  } finally {
    await f.close();
  }
});
test("erros de uma fonte são preservados e não viram resultados zero", async () => {
  const f = await fixture("live", {
    query: async () => {
      throw new Error("Permissão ausente.");
    },
  });
  try {
    const c = f.store.put("clients", {
      id: "real",
      name: "Cliente real",
      business: "leadgen",
    });
    f.store.put("connections", { id: "cx", provider: "meta" });
    f.store.put("accounts", {
      id: "a",
      provider: "meta",
      connectionId: "cx",
      clientId: c.id,
      timezone: "America/Sao_Paulo",
    });
    await f.request("/login", { password: "a-secure-test-password" });
    await f.request("/bootstrap");
    const r = await f.request("/clients/real/report?days=7");
    assert.equal(r.data.accounts.length, 0);
    assert.equal(r.data.errors.length, 1);
    assert.equal(r.data.errors[0].error, "Permissão ausente.");
  } finally {
    await f.close();
  }
});
test("OAuth é ligado à sessão e impede replay de autorização cancelada", async () => {
  const f = await fixture("live", {
    env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" },
  });
  try {
    await f.request("/login", { password: "a-secure-test-password" });
    await f.request("/bootstrap");
    const start = await f.request("/oauth/ga4/start", {});
    assert.equal(start.status, 200);
    const url = new URL(start.data.url),
      state = url.searchParams.get("state");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.equal(
      (await f.request("/oauth/ga4/callback?state=wrong&error=access_denied"))
        .status,
      400,
    );
    assert.equal(
      (
        await f.request(
          `/oauth/ga4/callback?state=${state}&error=access_denied`,
        )
      ).status,
      302,
    );
    assert.equal(
      (
        await f.request(
          `/oauth/ga4/callback?state=${state}&error=access_denied`,
        )
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("OAuth pede apenas o escopo da plataforma solicitada e redirect fixo", () => {
  const env = {
    APP_URL: origin,
    GOOGLE_CLIENT_ID: "test",
    META_APP_ID: "test",
  };
  const google = new URL(oauthUrl("ga4", "state", "verifier", env));
  assert.equal(
    google.searchParams.get("scope"),
    "https://www.googleapis.com/auth/analytics.readonly",
  );
  assert.equal(
    google.searchParams.get("redirect_uri"),
    origin + "/api/oauth/ga4/callback",
  );
  assert.equal(
    new URL(oauthUrl("meta", "s", "v", env)).searchParams.get("scope"),
    "ads_read",
  );
});
