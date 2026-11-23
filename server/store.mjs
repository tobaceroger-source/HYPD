import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

export function openStore(path, secret) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));`);
  const key = createHash("sha256").update(secret).digest();
  return {
    db,
    list(kind) {
      return db
        .prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid")
        .all(kind)
        .map((r) => JSON.parse(r.body));
    },
    get(kind, id) {
      const r = db
        .prepare("SELECT body FROM records WHERE kind=? AND id=?")
        .get(kind, id);
      return r ? JSON.parse(r.body) : null;
    },
    put(kind, value) {
      const row = { ...value, id: value.id || randomUUID() };
      db.prepare(
        "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      ).run(kind, row.id, JSON.stringify(row));
      return row;
    },
    remove(kind, id) {
      db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
    },
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), data]
        .map((x) => x.toString("base64url"))
        .join(".");
    },
    decrypt(value) {
      const [iv, tag, data] = value
        .split(".")
        .map((x) => Buffer.from(x, "base64url"));
      const cipher = createDecipheriv("aes-256-gcm", key, iv);
      cipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([cipher.update(data), cipher.final()]).toString(),
      );
    },
  };
}

export function seedDemo(store) {
  if (store.get("settings", "seeded")) {
    for (const provider of ["google_ads", "meta", "ga4"])
      if (
        !store.get("accounts", `${provider}-available`) &&
        store.get("connections", `demo-${provider}`)
      )
        store.put("accounts", {
          id: `${provider}-available`,
          connectionId: `demo-${provider}`,
          provider,
          externalId: "100000003",
          name: "Conta de exemplo · sem vínculo",
          clientId: null,
          currency: "BRL",
          timezone: "America/Sao_Paulo",
          demo: true,
        });
    return;
  }
  for (const row of [
    {
      id: "aurora",
      name: "Aurora Living",
      business: "leadgen",
      goal: "Gerar contatos qualificados para visitas ao showroom.",
      notes:
        "Distinguir conversas iniciadas de leads qualificados. Priorizar custo e qualidade dos contatos.",
      monthlyBudget: 12000,
      color: "#7861d3",
    },
    {
      id: "atelier",
      name: "Atelier Café",
      business: "ecommerce",
      goal: "Aumentar vendas online com eficiência.",
      notes:
        "Receita das plataformas é atribuída; conferir pedidos pagos antes de concluir o resultado comercial.",
      monthlyBudget: 8000,
      color: "#aa6b3d",
    },
    {
      id: "clinica",
      name: "Clínica Horizonte",
      business: "leadgen",
      goal: "Gerar agendamentos para avaliação.",
      notes: "Agendamentos confirmados são informados pelo atendimento.",
      monthlyBudget: 5000,
      color: "#338376",
    },
  ])
    store.put("clients", row);
  for (const provider of ["google_ads", "meta", "ga4"]) {
    const c = store.put("connections", {
      id: `demo-${provider}`,
      provider,
      label:
        provider === "meta"
          ? "Workspace demonstrativo"
          : "contato@demonstracao.local",
      demo: true,
      createdAt: new Date().toISOString(),
    });
    for (const [i, clientId] of ["aurora", "atelier"].entries())
      store.put("accounts", {
        id: `${provider}-${clientId}`,
        connectionId: c.id,
        provider,
        externalId: String(100000001 + i),
        name: `${i ? "Atelier Café" : "Aurora Living"}${provider === "ga4" ? " · Website" : ""}`,
        clientId,
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        demo: true,
      });
    store.put("accounts", {
      id: `${provider}-available`,
      connectionId: c.id,
      provider,
      externalId: "100000003",
      name: "Conta de exemplo · sem vínculo",
      clientId: null,
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      demo: true,
    });
  }
  store.put("settings", { id: "seeded", value: true });
}
