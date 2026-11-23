import { createHash, createHmac, randomBytes } from "node:crypto";
import { parseGoogle, parseMeta, summarize } from "./metrics.mjs";

export function configuration(env) {
  return {
    google_ads: {
      required: [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_ADS_DEVELOPER_TOKEN",
      ],
      scope: "https://www.googleapis.com/auth/adwords",
    },
    ga4: {
      required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      scope: "https://www.googleapis.com/auth/analytics.readonly",
    },
    meta: { required: ["META_APP_ID", "META_APP_SECRET"], scope: "ads_read" },
  };
}
export async function jsonFetch(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(25000),
  });
  let body;
  try {
    body = await r.json();
  } catch {
    throw new Error("A plataforma retornou uma resposta inválida.");
  }
  if (!r.ok || body.error) {
    const error = new Error(
      `A plataforma recusou a consulta (${r.status}). Confira permissões, versão da API e conexão.`,
    );
    error.status = r.status;
    throw error;
  }
  return body;
}
export function oauthUrl(provider, state, verifier, env) {
  const redirect = `${env.APP_URL}/api/oauth/${provider}/callback`;
  const p = new URLSearchParams({
    client_id: provider === "meta" ? env.META_APP_ID : env.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: "code",
    state,
  });
  if (provider === "meta") {
    if (env.META_LOGIN_CONFIG_ID) p.set("config_id", env.META_LOGIN_CONFIG_ID);
    else p.set("scope", "ads_read");
    return `https://www.facebook.com/${env.META_API_VERSION || "v27.0"}/dialog/oauth?${p}`;
  }
  p.set("scope", configuration(env)[provider].scope);
  p.set("access_type", "offline");
  p.set("prompt", "consent");
  p.set("include_granted_scopes", "true");
  p.set(
    "code_challenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  p.set("code_challenge_method", "S256");
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
export async function exchangeCode(provider, code, verifier, env) {
  const redirect_uri = `${env.APP_URL}/api/oauth/${provider}/callback`;
  if (provider === "meta") {
    const endpoint = `https://graph.facebook.com/${env.META_API_VERSION || "v27.0"}/oauth/access_token`;
    // Meta documents these exchanges as GET. This URL never reaches the browser or logs.
    const token = await jsonFetch(
      `${endpoint}?${new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri, code })}`,
    );
    const long = await jsonFetch(
      `${endpoint}?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: token.access_token })}`,
    );
    return {
      ...long,
      expires_at: Date.now() + (long.expires_in || 3600) * 1000,
    };
  }
  const token = await jsonFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!token.refresh_token)
    throw new Error(
      "O Google não devolveu autorização para renovação. Reconecte concedendo acesso offline.",
    );
  return { ...token, expires_at: Date.now() + token.expires_in * 1000 };
}
const locks = new Map();
export async function accessToken(connection, store, env) {
  if (locks.has(connection.id)) return locks.get(connection.id);
  const pending = (async () => {
    const current = store.get("connections", connection.id);
    if (!current) throw new Error("Conexão removida.");
    let token = store.decrypt(current.secret);
    if (token.expires_at < Date.now() + 60000) {
      if (connection.provider === "meta")
        throw new Error(
          "Sua autorização Meta expirou. Reconecte a plataforma.",
        );
      const renewed = await jsonFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: token.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      token = {
        ...token,
        ...renewed,
        expires_at: Date.now() + renewed.expires_in * 1000,
      };
      store.put("connections", { ...current, secret: store.encrypt(token) });
    }
    return token.access_token;
  })();
  locks.set(connection.id, pending);
  try {
    return await pending;
  } finally {
    locks.delete(connection.id);
  }
}
function googleHeaders(token, env, managerId) {
  return {
    Authorization: `Bearer ${token}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
    ...(managerId ? { "login-customer-id": managerId } : {}),
  };
}
async function gaql(token, id, query, env, managerId) {
  let pageToken;
  const all = [];
  do {
    const body = await jsonFetch(
      `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION || "v26"}/customers/${id}/googleAds:search`,
      {
        method: "POST",
        headers: googleHeaders(token, env, managerId),
        body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
      },
    );
    all.push(...(body.results || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return all;
}
async function metaList(path, token, env, params = {}) {
  let after;
  const all = [];
  do {
    const p = new URLSearchParams({
      ...params,
      limit: "100",
      appsecret_proof: createHmac("sha256", env.META_APP_SECRET)
        .update(token)
        .digest("hex"),
      ...(after ? { after } : {}),
    });
    const body = await jsonFetch(
      `https://graph.facebook.com/${env.META_API_VERSION || "v27.0"}/${path}?${p}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    all.push(...(body.data || []));
    after = body.paging?.next ? body.paging?.cursors?.after : null;
    if (body.paging?.next && !after)
      throw new Error("Paginação Meta incompleta; consulta interrompida.");
  } while (after);
  return all;
}
export async function discoverAccounts(provider, token, env) {
  if (provider === "meta")
    return (
      await metaList("me/adaccounts", token, env, {
        fields: "id,name,currency,timezone_name,account_status",
      })
    )
      .filter((a) => a.account_status === 1)
      .map((a) => ({
        externalId: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone_name,
      }));
  if (provider === "ga4") {
    let pageToken;
    const properties = [];
    do {
      const p = new URLSearchParams({
        pageSize: "200",
        ...(pageToken ? { pageToken } : {}),
      });
      const b = await jsonFetch(
        `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${p}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      for (const a of b.accountSummaries || [])
        properties.push(...(a.propertySummaries || []));
      pageToken = b.nextPageToken;
    } while (pageToken);
    return Promise.all(
      properties.map(async (a) => {
        const b = await jsonFetch(
          `https://analyticsadmin.googleapis.com/v1beta/${a.property}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return {
          externalId: a.property.replace("properties/", ""),
          name: a.displayName,
          currency: b.currencyCode,
          timezone: b.timeZone,
        };
      }),
    );
  }
  const roots = await jsonFetch(
    `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION || "v26"}/customers:listAccessibleCustomers`,
    { headers: googleHeaders(token, env) },
  );
  const accounts = new Map();
  const errors = [];
  for (const resource of roots.resourceNames || []) {
    const id = resource.split("/").pop();
    try {
      const hierarchy = await gaql(
        token,
        id,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.currency_code, customer_client.time_zone, customer_client.status FROM customer_client",
        env,
        id,
      );
      for (const row of hierarchy) {
        const a = row.customerClient;
        if (!a.manager && a.status === "ENABLED")
          accounts.set(String(a.id), {
            externalId: String(a.id),
            name: a.descriptiveName || String(a.id),
            currency: a.currencyCode,
            timezone: a.timeZone,
            managerId: id,
          });
      }
    } catch {
      errors.push(id);
    }
  }
  if (errors.length)
    throw new Error(
      `Não foi possível listar todas as contas Google (${errors.length} acesso(s)). Confira token de desenvolvedor, permissões e MCC antes de tentar novamente.`,
    );
  return [...accounts.values()];
}
export async function queryAccount(
  account,
  connection,
  client,
  range,
  store,
  env,
) {
  const token = await accessToken(connection, store, env);
  if (account.provider === "google_ads") {
    const pull = async (start, end) =>
      parseGoogle(
        await gaql(
          token,
          account.externalId,
          `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}'`,
          env,
          account.managerId,
        ),
      );
    const [rows, previousRows] = await Promise.all([
      pull(range.start, range.end),
      pull(range.previousStart, range.previousEnd),
    ]);
    return {
      rows,
      previousRows,
      totals: summarize(rows),
      previous: summarize(previousRows),
      definition:
        "Conversões configuradas no Google Ads; valor de conversão atribuído, sem confirmação de pagamento.",
    };
  }
  if (account.provider === "meta") {
    const pull = async (start, end) =>
      parseMeta(
        await metaList(`${account.externalId}/insights`, token, env, {
          level: "campaign",
          fields:
            "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values",
          time_range: JSON.stringify({ since: start, until: end }),
          use_unified_attribution_setting: "true",
        }),
        client.business,
      );
    const [rows, previousRows] = await Promise.all([
      pull(range.start, range.end),
      pull(range.previousStart, range.previousEnd),
    ]);
    return {
      rows,
      previousRows,
      totals: summarize(rows),
      previous: summarize(previousRows),
      definition: `${client.business === "ecommerce" ? "Compras omni_purchase (purchase apenas como fallback)" : "Eventos lead; mensagens não incluídas"}. Atribuição conforme configurações dos conjuntos.`,
    };
  }
  const pull = async (start, end) => {
    const b = await jsonFetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${account.externalId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: "sessionSourceMedium" }],
          metrics: [
            { name: "sessions" },
            { name: "keyEvents" },
            { name: "purchaseRevenue" },
          ],
          limit: 10000,
          returnPropertyQuota: true,
        }),
      },
    );
    if (Number(b.rowCount) > 10000)
      throw new Error(
        "Relatório GA4 excedeu o limite desta versão; reduza o período.",
      );
    const rows = (b.rows || []).map((r) => ({
      name: r.dimensionValues[0].value,
      sessions: Number(r.metricValues[0].value),
      keyEvents: Number(r.metricValues[1].value),
      revenue: Number(r.metricValues[2].value),
    }));
    return {
      rows,
      totals: rows.reduce(
        (a, r) => ({
          sessions: a.sessions + r.sessions,
          keyEvents: a.keyEvents + r.keyEvents,
          revenue: a.revenue + r.revenue,
        }),
        { sessions: 0, keyEvents: 0, revenue: 0 },
      ),
      metadata: b.metadata,
    };
  };
  const [current, previous] = await Promise.all([
    pull(range.start, range.end),
    pull(range.previousStart, range.previousEnd),
  ]);
  return {
    rows: current.rows,
    previousRows: previous.rows,
    totals: current.totals,
    previous: previous.totals,
    metadata: current.metadata,
    definition:
      "Sessões por origem/mídia da sessão; eventos principais e receita de compras registrados no GA4, sujeitos à implementação e atribuição.",
  };
}
export const verifier = () => randomBytes(32).toString("base64url");
