export const PROVIDERS = {
  google_ads: "Google Ads",
  meta: "Meta Ads",
  ga4: "Google Analytics 4",
};
const number = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
export function dateRange(
  days,
  now = new Date(),
  timezone = "America/Sao_Paulo",
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    previousStart: previousStart.toISOString().slice(0, 10),
    previousEnd: previousEnd.toISOString().slice(0, 10),
    timezone,
  };
}
export function summarize(rows) {
  const r = rows.reduce(
    (a, r) => ({
      spend: a.spend + number(r.spend),
      impressions: a.impressions + number(r.impressions),
      clicks: a.clicks + number(r.clicks),
      conversions: a.conversions + number(r.conversions),
      value: a.value + number(r.value),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 },
  );
  return {
    ...r,
    cpa: r.conversions ? r.spend / r.conversions : null,
    roas: r.spend ? r.value / r.spend : null,
    ctr: r.impressions ? (r.clicks / r.impressions) * 100 : null,
  };
}
export function parseGoogle(rows) {
  return rows.map((r) => ({
    id: r.campaign?.id,
    name: r.campaign?.name || "Campanha",
    spend: number(r.metrics?.costMicros) / 1e6,
    impressions: number(r.metrics?.impressions),
    clicks: number(r.metrics?.clicks),
    conversions: number(r.metrics?.conversions),
    value: number(r.metrics?.conversionsValue),
  }));
}
export function parseMeta(rows, business) {
  return rows.map((r) => {
    // Explicit event identity: never sum overlapping purchase aliases or lead + messaging.
    const event = business === "ecommerce" ? "omni_purchase" : "lead";
    const fallback = business === "ecommerce" ? "purchase" : null;
    const action =
      r.actions?.find((a) => a.action_type === event) ||
      r.actions?.find((a) => a.action_type === fallback);
    const value =
      r.action_values?.find((a) => a.action_type === event) ||
      r.action_values?.find((a) => a.action_type === fallback);
    return {
      id: r.campaign_id,
      name: r.campaign_name || "Campanha",
      spend: number(r.spend),
      impressions: number(r.impressions),
      clicks: number(r.inline_link_clicks),
      conversions: number(action?.value),
      value: number(value?.value),
      resultEvent: action?.action_type || event,
    };
  });
}
export function demoAccount(account, days, client) {
  const factor = (days / 30) * (client.id === "atelier" ? 0.65 : 1);
  const isMeta = account.provider === "meta";
  if (account.provider === "ga4")
    return {
      rows: [
        {
          name: "google / cpc",
          sessions: Math.round(2340 * factor),
          keyEvents: Math.round(128 * factor),
          revenue: client.business === "ecommerce" ? 15400 * factor : 0,
        },
        {
          name: "facebook / paid_social",
          sessions: Math.round(1820 * factor),
          keyEvents: Math.round(87 * factor),
          revenue: client.business === "ecommerce" ? 9800 * factor : 0,
        },
        {
          name: "direct / (none)",
          sessions: Math.round(740 * factor),
          keyEvents: Math.round(52 * factor),
          revenue: client.business === "ecommerce" ? 8200 * factor : 0,
        },
      ],
      previousRows: [],
      totals: {
        sessions: Math.round(4900 * factor),
        keyEvents: Math.round(267 * factor),
        revenue: client.business === "ecommerce" ? 33400 * factor : 0,
      },
      previous: {
        sessions: Math.round(4450 * factor),
        keyEvents: Math.round(238 * factor),
        revenue: client.business === "ecommerce" ? 29800 * factor : 0,
      },
    };
  const rows = (
    isMeta
      ? [
          ["Prospecção · Vídeo", 2840, 103500, 1920, 92],
          ["Remarketing · Catálogo", 1360, 42800, 950, 58],
        ]
      : [
          ["Pesquisa · Alta intenção", 3520, 48200, 2410, 164],
          ["Performance Max", 2180, 126400, 1830, 73],
          ["Pesquisa · Marca", 490, 12300, 890, 61],
        ]
  ).map(([name, spend, impressions, clicks, conversions], i) => ({
    name,
    id: `demo-${i}`,
    spend: Math.round(spend * factor),
    impressions: Math.round(impressions * factor),
    clicks: Math.round(clicks * factor),
    conversions: Math.round(conversions * factor),
    value:
      client.business === "ecommerce"
        ? Math.round(spend * factor * (isMeta ? 3.1 : 4.2))
        : 0,
    resultEvent: isMeta ? "lead" : "conversions",
  }));
  const previousRows = rows.map((r) => ({
    ...r,
    spend: r.spend * 0.94,
    conversions: Math.round(r.conversions * (isMeta ? 1.13 : 0.87)),
    value: r.value * 0.91,
  }));
  return {
    rows,
    previousRows,
    totals: summarize(rows),
    previous: summarize(previousRows),
  };
}
