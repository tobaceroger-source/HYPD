import express from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  configuration,
  oauthUrl,
  exchangeCode,
  discoverAccounts,
  queryAccount,
  verifier,
  accessToken,
} from "./connectors.mjs";
import { dateRange, demoAccount } from "./metrics.mjs";
import { analyze } from "./analyst.mjs";

const hash = (s) => createHash("sha256").update(s).digest("hex");
const clientSchema = z.object({
  name: z.string().trim().min(2).max(90),
  business: z.enum(["leadgen", "ecommerce"]),
  goal: z.string().max(1500),
  notes: z.string().max(4000),
  monthlyBudget: z.number().min(0).max(1e9).default(0),
});
const daysSchema = z.coerce.number().refine((x) => [7, 14, 30, 90].includes(x));
export function createApp({
  store,
  env,
  analyzer = analyze,
  query = queryAccount,
}) {
  const app = express();
  app.disable("x-powered-by");
  const live = env.APP_MODE === "live";
  const config = configuration(env),
    cache = new Map(),
    busy = new Set(),
    attempts = new Map();
  const cookie = (res, value) =>
    res.cookie("traffic_session", value, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.APP_URL.startsWith("https:"),
      path: "/",
      maxAge: 8 * 3600000,
    });
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    const sid = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("traffic_session="))
      ?.split("=")[1];
    let session = sid ? store.get("sessions", hash(sid)) : null;
    if (session && session.expires < Date.now()) {
      store.remove("sessions", session.id);
      session = null;
    }
    if (!session && !live && !env.ADMIN_PASSWORD) {
      const id = randomBytes(32).toString("hex");
      session = store.put("sessions", {
        id: hash(id),
        csrf: randomBytes(24).toString("hex"),
        expires: Date.now() + 8 * 3600000,
      });
      cookie(res, id);
    }
    req.session = session;
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
      if (req.headers.origin !== new URL(env.APP_URL).origin)
        return res
          .status(403)
          .json({ error: "Origem da requisição inválida." });
      if (
        req.path !== "/login" &&
        (!session || req.headers["x-csrf-token"] !== session.csrf)
      )
        return res
          .status(403)
          .json({ error: "Sessão expirada. Recarregue a página." });
    }
    if (!session && !["/login", "/health"].includes(req.path))
      return res
        .status(401)
        .json({ error: "Entre para acessar sua central.", authRequired: true });
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/login", (req, res) => {
    const key = req.ip;
    const a = attempts.get(key) || { count: 0, until: Date.now() + 15 * 60000 };
    if (a.until < Date.now()) {
      a.count = 0;
      a.until = Date.now() + 15 * 60000;
    }
    a.count++;
    attempts.set(key, a);
    if (a.count > 10)
      return res
        .status(429)
        .json({ error: "Muitas tentativas. Aguarde 15 minutos." });
    const supplied = hash(String(req.body.password || "")),
      expected = hash(env.ADMIN_PASSWORD || randomBytes(30).toString("hex"));
    if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))
      return res.status(401).json({ error: "Senha inválida." });
    const id = randomBytes(32).toString("hex");
    store.put("sessions", {
      id: hash(id),
      csrf: randomBytes(24).toString("hex"),
      expires: Date.now() + 8 * 3600000,
    });
    cookie(res, id);
    attempts.delete(key);
    res.json({ ok: true });
  });
  app.post("/api/logout", (req, res) => {
    store.remove("sessions", req.session.id);
    res.clearCookie("traffic_session", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/bootstrap", (req, res) =>
    res.json({
      mode: env.APP_MODE,
      csrf: req.session.csrf,
      aiConfigured: !!(env.OPENAI_API_KEY || env.AI_GATEWAY_API_KEY),
      clients: store.list("clients"),
      connections: store.list("connections").map(({ secret, ...c }) => c),
      accounts: store.list("accounts"),
      providers: Object.fromEntries(
        Object.entries(config).map(([p, c]) => [
          p,
          {
            configured: live && c.required.every((k) => !!env[k]),
            missing: c.required.filter((k) => !env[k]),
          },
        ]),
      ),
    }),
  );
  app.post("/api/clients", (req, res) => {
    const data = clientSchema.parse(req.body);
    res
      .status(201)
      .json(
        store.put("clients", {
          ...data,
          color: "#7861d3",
          createdAt: new Date().toISOString(),
        }),
      );
  });
  app.patch("/api/clients/:id", (req, res) => {
    const old = store.get("clients", req.params.id);
    if (!old) return res.status(404).json({ error: "Cliente não encontrado." });
    res.json(store.put("clients", { ...old, ...clientSchema.parse(req.body) }));
    cache.clear();
  });
  app.post("/api/accounts/:id/link", (req, res) => {
    const { clientId } = z
      .object({ clientId: z.string().nullable() })
      .parse(req.body);
    const account = store.get("accounts", req.params.id);
    if (!account)
      return res.status(404).json({ error: "Conta não encontrada." });
    if (clientId && !store.get("clients", clientId))
      return res.status(404).json({ error: "Cliente não encontrado." });
    if (clientId && account.clientId && account.clientId !== clientId)
      return res
        .status(409)
        .json({
          error: "Desvincule a conta do cliente atual antes de transferir.",
        });
    res.json(store.put("accounts", { ...account, clientId }));
    cache.clear();
  });
  app.post("/api/connections/:id/remove", (req, res) => {
    const c = store.get("connections", req.params.id);
    if (!c) return res.status(404).json({ error: "Conexão não encontrada." });
    for (const a of store
      .list("accounts")
      .filter((x) => x.connectionId === c.id))
      store.remove("accounts", a.id);
    store.remove("connections", c.id);
    cache.clear();
    res.json({ ok: true });
  });
  async function sync(c, token) {
    const discovered = await discoverAccounts(c.provider, token, env);
    const all = store.list("accounts"),
      existing = all.filter((a) => a.connectionId === c.id);
    const ids = new Set(discovered.map((a) => a.externalId));
    for (const old of existing)
      if (!ids.has(old.externalId)) store.remove("accounts", old.id);
    for (const a of discovered) {
      const old = all.find(
        (x) => x.provider === c.provider && x.externalId === a.externalId,
      );
      store.put("accounts", {
        ...old,
        ...a,
        connectionId: c.id,
        provider: c.provider,
        clientId: old?.clientId || null,
      });
    }
    store.put("connections", {
      ...store.get("connections", c.id),
      syncError: null,
      lastSync: new Date().toISOString(),
    });
    cache.clear();
    return discovered.length;
  }
  app.post("/api/connections/:id/sync", async (req, res) => {
    const c = store.get("connections", req.params.id);
    if (!c) return res.status(404).json({ error: "Conexão não encontrada." });
    if (c.demo)
      return res.json({
        count: store.list("accounts").filter((a) => a.connectionId === c.id)
          .length,
      });
    const count = await sync(c, await accessToken(c, store, env));
    res.json({ count });
  });
  app.post("/api/oauth/:provider/start", (req, res) => {
    const p = req.params.provider;
    if (!config[p])
      return res.status(400).json({ error: "Plataforma inválida." });
    if (!live)
      return res
        .status(409)
        .json({
          error:
            "Você está no modo demonstrativo. Configure o modo real para autorizar plataformas.",
        });
    const missing = config[p].required.filter((k) => !env[k]);
    if (missing.length)
      return res
        .status(409)
        .json({
          error: `Configuração pendente no servidor: ${missing.join(", ")}.`,
        });
    const state = randomBytes(32).toString("hex"),
      v = verifier();
    store.put("oauth", {
      id: hash(state),
      session: req.session.id,
      provider: p,
      verifier: v,
      expires: Date.now() + 10 * 60000,
    });
    res.json({ url: oauthUrl(p, state, v, env) });
  });
  app.get("/api/oauth/:provider/callback", async (req, res) => {
    const p = req.params.provider,
      state = typeof req.query.state === "string" ? req.query.state : "";
    const pending = store.get("oauth", hash(state));
    if (
      !pending ||
      pending.session !== req.session.id ||
      pending.provider !== p ||
      pending.expires < Date.now()
    )
      return res
        .status(400)
        .send(
          "Autorização inválida ou expirada. Volte ao Traffic Hub e tente novamente.",
        );
    store.remove("oauth", pending.id);
    if (req.query.error)
      return res.redirect("/?view=connections&oauth=cancelled");
    try {
      if (typeof req.query.code !== "string")
        throw new Error("Código ausente.");
      const token = await exchangeCode(
        p,
        req.query.code,
        pending.verifier,
        env,
      );
      const c = store.put("connections", {
        provider: p,
        label: `${p === "meta" ? "Meta" : "Google"} · ${new Date().toLocaleDateString("pt-BR")}`,
        secret: store.encrypt(token),
        createdAt: new Date().toISOString(),
      });
      try {
        await sync(c, token.access_token);
      } catch (error) {
        store.put("connections", { ...c, syncError: error.message });
        return res.redirect("/?view=connections&oauth=sync_error");
      }
      res.redirect("/?view=connections&oauth=success");
    } catch {
      return res.redirect("/?view=connections&oauth=error");
    }
  });
  async function report(clientId, days, force = false) {
    const client = store.get("clients", clientId);
    if (!client) {
      const e = new Error("Cliente não encontrado.");
      e.status = 404;
      throw e;
    }
    const key = `${clientId}:${days}`,
      cached = cache.get(key);
    if (!force && cached && Date.now() - cached.time < 60000)
      return cached.report;
    const accounts = store
        .list("accounts")
        .filter((a) => a.clientId === clientId),
      errors = [];
    const reports = await Promise.all(
      accounts.map(async (a) => {
        const c = store.get("connections", a.connectionId),
          range = dateRange(
            days,
            new Date(),
            a.timezone || "America/Sao_Paulo",
          );
        try {
          const data = !live
            ? demoAccount(a, days, client)
            : await query(a, c, client, range, store, env);
          return {
            ...a,
            ...data,
            range,
            definition: data.definition || "Dados fictícios para demonstração.",
            fetchedAt: new Date().toISOString(),
          };
        } catch (e) {
          errors.push({
            accountId: a.id,
            provider: a.provider,
            name: a.name,
            error: e.message,
          });
          return null;
        }
      }),
    );
    const r = {
      client,
      days,
      range: dateRange(days),
      accounts: reports.filter(Boolean),
      errors,
      fetchedAt: new Date().toISOString(),
      demo: !live,
      limitations: [
        "Resultados de plataformas não são vendas confirmadas.",
        "O dia atual foi excluído. Conversões recentes podem continuar chegando.",
        "O analista desta versão consulta desempenho agregado por campanha e origem/mídia; criativos, termos, rastreamento e mudanças exigem consultas adicionais.",
      ],
    };
    cache.set(key, { time: Date.now(), report: r });
    return r;
  }
  app.get("/api/clients/:id/report", async (req, res) =>
    res.json(
      await report(
        req.params.id,
        daysSchema.parse(req.query.days || 30),
        req.query.refresh === "true",
      ),
    ),
  );
  app.get("/api/clients/:id/messages", (req, res) => {
    if (!store.get("clients", req.params.id))
      return res.status(404).json({ error: "Cliente não encontrado." });
    const days = daysSchema.parse(req.query.days || 30);
    res.json(
      store
        .list("messages")
        .filter((m) => m.clientId === req.params.id && m.days === days),
    );
  });
  app.post("/api/clients/:id/chat", async (req, res) => {
    const { message, days } = z
      .object({ message: z.string().trim().min(1).max(4000), days: daysSchema })
      .parse(req.body);
    const key = `${req.session.id}:chat`;
    if (busy.has(key))
      return res
        .status(409)
        .json({ error: "Aguarde a análise atual terminar." });
    busy.add(key);
    try {
      const r = await report(req.params.id, days);
      const history = store
        .list("messages")
        .filter((m) => m.clientId === req.params.id && m.days === days);
      const answer = await analyzer(r, history, message, env);
      const common = {
        clientId: req.params.id,
        days,
        createdAt: new Date().toISOString(),
        range: r.range,
      };
      const user = store.put("messages", {
        ...common,
        role: "user",
        text: message,
      });
      const assistant = store.put("messages", {
        ...common,
        role: "assistant",
        text: answer.text,
        engine: answer.engine,
        model: answer.model,
        sources: r.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          provider: a.provider,
          range: a.range,
          fetchedAt: a.fetchedAt,
        })),
        errors: r.errors,
      });
      res.json({ user, assistant });
    } finally {
      busy.delete(key);
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Rota não encontrada." }),
  );
  app.use((err, _req, res, _next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: "Confira os campos informados.",
          fields: err.issues.map((x) => ({
            field: x.path.join("."),
            message: x.message,
          })),
        });
    res
      .status(err.status >= 400 && err.status < 600 ? err.status : 502)
      .json({
        error: err.message || "Não foi possível concluir. Tente novamente.",
      });
  });
  return app;
}
