import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { openStore, seedDemo } from "./store.mjs";
import { createApp } from "./app.mjs";

const env = {
  ...process.env,
  APP_MODE: process.env.APP_MODE || "demo",
  APP_URL: (process.env.APP_URL || "http://localhost:4317").replace(/\/$/, ""),
};
if (!["live", "demo"].includes(env.APP_MODE))
  throw new Error("APP_MODE deve ser demo ou live.");
if (
  env.APP_MODE === "live" &&
  (!env.ADMIN_PASSWORD ||
    env.ADMIN_PASSWORD.length < 12 ||
    !env.APP_SECRET ||
    env.APP_SECRET.length < 32)
)
  throw new Error(
    "Modo real exige ADMIN_PASSWORD (12+ caracteres) e APP_SECRET (32+ caracteres).",
  );
const host = process.env.HOST || "127.0.0.1";
if (!["127.0.0.1", "localhost", "::1"].includes(host) && !env.ADMIN_PASSWORD)
  throw new Error(
    "Configure ADMIN_PASSWORD antes de expor o servidor na rede.",
  );
const store = openStore(
  process.env.DB_PATH || `data/${env.APP_MODE}.sqlite`,
  env.APP_SECRET || randomBytes(32).toString("hex"),
);
if (env.APP_MODE === "demo") seedDemo(store);
const app = createApp({ store, env });
if (process.argv.includes("--production")) {
  const express = (await import("express")).default;
  app.use((_req, res, next) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, host },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(Number(process.env.PORT) || 4317, host, () =>
  console.log(`Traffic Hub: ${env.APP_URL} (${env.APP_MODE})`),
);
process.on("SIGINT", () =>
  server.close(() => {
    store.db.close();
    process.exit(0);
  }),
);
process.on("SIGTERM", () =>
  server.close(() => {
    store.db.close();
    process.exit(0);
  }),
);
