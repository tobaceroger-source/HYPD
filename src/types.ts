export type Provider = "google_ads" | "meta" | "ga4";
export type Client = {
  id: string;
  name: string;
  business: "leadgen" | "ecommerce";
  goal: string;
  notes: string;
  monthlyBudget: number;
  color: string;
};
export type Account = {
  id: string;
  connectionId: string;
  provider: Provider;
  externalId: string;
  name: string;
  clientId: string | null;
  currency: string;
  timezone: string;
  demo?: boolean;
};
export type Connection = {
  id: string;
  provider: Provider;
  label: string;
  demo?: boolean;
  lastSync?: string;
  syncError?: string;
};
export type Boot = {
  mode: "demo" | "live";
  csrf: string;
  aiConfigured: boolean;
  clients: Client[];
  accounts: Account[];
  connections: Connection[];
  providers: Record<Provider, { configured: boolean; missing: string[] }>;
};
export type Metric = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  value: number;
  cpa: number | null;
  roas: number | null;
  sessions?: number;
  keyEvents?: number;
  revenue?: number;
};
export type ReportAccount = Account & {
  totals: Metric;
  previous: Metric;
  rows: Array<{
    name: string;
    spend?: number;
    conversions?: number;
    clicks?: number;
    sessions?: number;
    keyEvents?: number;
    revenue?: number;
  }>;
  definition: string;
  fetchedAt: string;
  range: { start: string; end: string; timezone: string };
};
export type Report = {
  client: Client;
  days: number;
  demo: boolean;
  range: { start: string; end: string };
  accounts: ReportAccount[];
  errors: Array<{
    accountId: string;
    provider: Provider;
    name: string;
    error: string;
  }>;
  fetchedAt: string;
  limitations: string[];
};
export type Message = {
  id: string;
  clientId: string;
  days: number;
  role: "user" | "assistant";
  text: string;
  engine?: string;
  createdAt: string;
  range: { start: string; end: string };
  sources?: Array<{
    id: string;
    name: string;
    provider: Provider;
    range: { start: string; end: string };
    fetchedAt: string;
  }>;
};
