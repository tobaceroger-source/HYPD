import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type {
  Account,
  Boot,
  Client,
  Connection,
  Message,
  Provider,
  Report,
  ReportAccount,
} from "./types";

const platformNames: Record<Provider, string> = {
  google_ads: "Google Ads",
  meta: "Meta Ads",
  ga4: "Google Analytics 4",
};
const shortNames: Record<Provider, string> = {
  google_ads: "Google Ads",
  meta: "Meta Ads",
  ga4: "GA4",
};
const dates = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
const count = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
const money = (n: number, c = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(n);
const suggestions = [
  {
    icon: Activity,
    title: "Investigar desempenho",
    text: "Compare o desempenho com o período anterior. O que mudou e quais são as três prioridades para investigar?",
  },
  {
    icon: BarChart3,
    title: "Revisar investimento",
    text: "Revise a distribuição do investimento e a eficiência das campanhas. Quais pontos precisam de uma análise mais detalhada antes de mudar a verba?",
  },
  {
    icon: FileText,
    title: "Preparar fechamento",
    text: "Prepare um fechamento curto para WhatsApp com os resultados por canal, limitações e uma pergunta sobre a qualidade dos contatos.",
  },
];
type View = "overview" | "clients" | "connections" | "analyst";
const viewNames: Record<View, string> = {
  overview: "Visão geral",
  clients: "Clientes",
  connections: "Conexões",
  analyst: "Analista",
};

function PlatformIcon({
  provider,
  small = false,
}: {
  provider: Provider;
  small?: boolean;
}) {
  return (
    <span
      className={`platform-icon ${provider} ${small ? "small" : ""}`}
      aria-label={platformNames[provider]}
    >
      {provider === "google_ads" ? (
        <span className="google-a">A</span>
      ) : provider === "meta" ? (
        <span className="meta-mark">∞</span>
      ) : (
        <BarChart3 size={small ? 16 : 22} />
      )}
    </span>
  );
}
function Spinner() {
  return <Loader2 size={17} className="spin" aria-hidden="true" />;
}
function Avatar({
  client,
  small = false,
}: {
  client: Client;
  small?: boolean;
}) {
  return (
    <span
      className={`client-avatar ${small ? "small" : ""}`}
      style={{ "--client-color": client.color } as React.CSSProperties}
    >
      {client.name
        .split(" ")
        .slice(0, 2)
        .map((x) => x[0])
        .join("")}
    </span>
  );
}
function Empty({
  icon: Icon = Link2,
  title,
  text,
  action,
}: {
  icon?: typeof Link2;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null),
    [auth, setAuth] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const initialView = new URLSearchParams(location.search).get("view");
  const [view, setView] = useState<View>(
    initialView && initialView in viewNames
      ? (initialView as View)
      : "overview",
  );
  const [clientId, setClientId] = useState(""),
    [days, setDays] = useState(30),
    [reportState, setReport] = useState<Report | null>(null),
    [loading, setLoading] = useState(false),
    [reportError, setReportError] = useState("");
  const [messageState, setMessages] = useState<Message[]>([]),
    [historyLoading, setHistoryLoading] = useState(false),
    [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false),
    [pendingAction, setPendingAction] = useState(""),
    [sidebar, setSidebar] = useState(false);
  const [editClient, setEditClient] = useState<Client | "new" | null>(null),
    [providerModal, setProviderModal] = useState<Provider | null>(null),
    [removeConnection, setRemoveConnection] = useState<Connection | null>(null),
    [sourceFilter, setSourceFilter] = useState<Provider | "all">("all"),
    [accountSearch, setAccountSearch] = useState(""),
    [clientSearch, setClientSearch] = useState("");
  const csrf = useRef(""),
    requestVersion = useRef(0),
    bottom = useRef<HTMLDivElement>(null);
  const client = boot?.clients.find((c) => c.id === clientId);
  const report =
    reportState?.client.id === clientId && reportState.days === days
      ? reportState
      : null;
  const messages = useMemo(
    () =>
      messageState.filter((m) => m.clientId === clientId && m.days === days),
    [messageState, clientId, days],
  );
  const activeContext = useRef({ clientId, days });
  activeContext.current = { clientId, days };
  async function api(path: string, options: RequestInit = {}) {
    const r = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.current,
        ...options.headers,
      },
    });
    const b = await r.json();
    if (!r.ok) {
      if (r.status === 401) setAuth(true);
      throw new Error(b.error || "Não foi possível concluir a solicitação.");
    }
    return b;
  }
  async function loadBoot() {
    try {
      const data: Boot = await api("/bootstrap");
      csrf.current = data.csrf;
      setBoot(data);
      setAuth(false);
      setClientId((id) =>
        data.clients.some((c) => c.id === id) ? id : data.clients[0]?.id || "",
      );
      return data;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void loadBoot();
    const q = new URLSearchParams(location.search);
    const status = q.get("oauth");
    if (status) {
      setNotice(
        (
          {
            success:
              "Plataforma autorizada. Vincule as contas aos seus clientes.",
            cancelled: "A autorização foi cancelada.",
            sync_error:
              "Autorização salva, mas a listagem falhou. Atualize as contas para tentar novamente.",
            error:
              "Não foi possível concluir a autorização. Confira a configuração do servidor.",
          } as Record<string, string>
        )[status] || "",
      );
      q.delete("oauth");
      history.replaceState(null, "", `/?${q}`);
    }
    const pop = () => {
      const v = new URLSearchParams(location.search).get("view");
      setView(v && v in viewNames ? (v as View) : "overview");
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const n = ++requestVersion.current;
    if (!boot || !clientId) {
      setReport(null);
      setMessages([]);
      return;
    }
    setLoading(true);
    setReport(null);
    setReportError("");
    setMessages([]);
    setHistoryLoading(true);
    api(`/clients/${clientId}/report?days=${days}`)
      .then((r) => {
        if (n === requestVersion.current) setReport(r);
      })
      .catch((e) => {
        if (n === requestVersion.current) setReportError(e.message);
      })
      .finally(() => {
        if (n === requestVersion.current) setLoading(false);
      });
    api(`/clients/${clientId}/messages?days=${days}`)
      .then((m) => {
        if (n === requestVersion.current) setMessages(m);
      })
      .catch((e) => {
        if (n === requestVersion.current) setReportError(e.message);
      })
      .finally(() => {
        if (n === requestVersion.current) setHistoryLoading(false);
      });
  }, [boot, clientId, days]);
  useEffect(() => {
    const transcript = bottom.current?.parentElement;
    if (transcript && (messages.length || sending))
      transcript.scrollTo({
        top: transcript.scrollHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [messages, sending]);
  function navigate(v: View) {
    setView(v);
    setSidebar(false);
    const u = new URL(location.href);
    u.searchParams.set("view", v);
    history.pushState(null, "", u);
  }
  async function perform(key: string, fn: () => Promise<void>) {
    setPendingAction(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingAction("");
    }
  }
  async function refresh() {
    if (!clientId) return;
    const context = { clientId, days };
    setLoading(true);
    try {
      const next = await api(
        `/clients/${clientId}/report?days=${days}&refresh=true`,
      );
      if (
        activeContext.current.clientId === context.clientId &&
        activeContext.current.days === context.days
      ) {
        setReport(next);
        setReportError("");
      }
    } catch (e) {
      if (
        activeContext.current.clientId === context.clientId &&
        activeContext.current.days === context.days
      )
        setReportError((e as Error).message);
    } finally {
      if (
        activeContext.current.clientId === context.clientId &&
        activeContext.current.days === context.days
      )
        setLoading(false);
    }
  }
  async function send(text = draft) {
    if (!text.trim() || sending || historyLoading || !client) return;
    navigate("analyst");
    setSending(true);
    setError("");
    const original = text,
      context = { clientId, days };
    setDraft("");
    try {
      const r = await api(`/clients/${clientId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: text, days }),
      });
      if (
        activeContext.current.clientId === context.clientId &&
        activeContext.current.days === context.days
      )
        setMessages((m) => [...m, r.user, r.assistant]);
      else setNotice(`Resposta salva na conversa de ${client.name}.`);
    } catch (e) {
      setError((e as Error).message);
      if (
        activeContext.current.clientId === context.clientId &&
        activeContext.current.days === context.days
      )
        setDraft(original);
    } finally {
      setSending(false);
    }
  }
  function chooseClient(id: string) {
    if (sending) return;
    setClientId(id);
    setDraft("");
  }
  const linked = boot?.accounts.filter((a) => a.clientId === clientId) || [];

  if (auth)
    return (
      <main className="login-page">
        <div className="login-box">
          <Logo />
          <span className="eyebrow">SEU WORKSPACE PESSOAL</span>
          <h1>Bem-vindo à sua central.</h1>
          <p>Entre para acessar clientes, conexões e análises.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform("login", async () => {
                await api("/login", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setPassword("");
                await loadBoot();
                setError("");
              });
            }}
          >
            <label htmlFor="password">Senha do workspace</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={pendingAction === "login"}
            >
              {pendingAction === "login" ? (
                <Spinner />
              ) : (
                <>
                  Entrar <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    );
  if (!boot)
    return (
      <main className="initial-loading">
        <Logo />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button" onClick={() => void loadBoot()}>
              Tentar novamente
            </button>
          </>
        ) : (
          <p>
            <Spinner /> Preparando seu workspace…
          </p>
        )}
      </main>
    );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-button mobile-only"
            aria-label="Fechar menu"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={20} />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-icon">R</span>
          <div>
            <strong>Meu workspace</strong>
            <small>Uso pessoal</small>
          </div>
          <ChevronsUpDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Navegação principal">
          {(
            [
              { id: "overview", icon: LayoutDashboard },
              { id: "clients", icon: Users },
              { id: "connections", icon: Link2 },
              { id: "analyst", icon: MessageSquare },
            ] as const
          ).map(({ id, icon: Icon }) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {viewNames[id]}
              {id === "clients" && (
                <span className="nav-count">{boot.clients.length}</span>
              )}
              {id === "analyst" && <span className="nav-ai">IA</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label client-nav-heading">
          SEUS CLIENTES
          <button
            className="icon-button"
            aria-label="Adicionar cliente"
            onClick={() => setEditClient("new")}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-clients">
          {boot.clients.slice(0, 7).map((c) => (
            <button
              key={c.id}
              className={`client-nav ${c.id === clientId ? "selected" : ""}`}
              disabled={sending}
              onClick={() => chooseClient(c.id)}
            >
              <Avatar client={c} small />
              <span>{c.name}</span>
              {c.id === clientId && <span className="selection-dot" />}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={17} />
            <span>
              Seu espaço. Seus dados.
              <small>Consultas de mídia em modo leitura</small>
            </span>
          </div>
          <button
            className="profile"
            onClick={() =>
              boot.mode === "live"
                ? void perform("logout", async () => {
                    await api("/logout", { method: "POST" });
                    setAuth(true);
                    setBoot(null);
                  })
                : setProviderModal("google_ads")
            }
          >
            <span className="profile-avatar">R</span>
            <span>
              Workspace pessoal
              <small>
                {boot.mode === "demo"
                  ? "Ambiente demonstrativo"
                  : "Sessão protegida"}
              </small>
            </span>
            {boot.mode === "live" ? (
              <LogOut size={17} />
            ) : (
              <Settings2 size={17} />
            )}
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="Abrir menu"
              onClick={() => setSidebar(true)}
            >
              <PanelLeftOpen size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="header-right">
            <span className={`mode-pill ${boot.mode}`}>
              <span />
              {boot.mode === "demo" ? "Modo demonstrativo" : "Dados reais"}
            </span>
            <span className="personal-badge">
              <ShieldCheck size={14} /> Acesso pessoal
            </span>
          </div>
        </header>
        <main
          className={`main-content ${view === "analyst" ? "analyst-page" : ""}`}
        >
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dispensar erro"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Dispensar mensagem"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view !== "connections" && view !== "clients" && (
            <div className="context-toolbar">
              <div className="client-select">
                <span className="text-label">Cliente</span>
                <label className="select-wrap">
                  <Users size={16} />
                  <select
                    aria-label="Cliente selecionado"
                    value={clientId}
                    onChange={(e) => chooseClient(e.target.value)}
                    disabled={sending || !boot.clients.length}
                  >
                    {boot.clients.length ? (
                      boot.clients.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))
                    ) : (
                      <option value="">Selecione um cliente</option>
                    )}
                  </select>
                  <ChevronDown size={15} />
                </label>
              </div>
              <div className="period-controls">
                <label className="select-wrap">
                  <Clock3 size={15} />
                  <select
                    aria-label="Período de análise"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    disabled={sending}
                  >
                    {[7, 14, 30, 90].map((n) => (
                      <option key={n} value={n}>
                        Últimos {n} dias completos
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button
                  className="icon-button refresh"
                  onClick={() => void refresh()}
                  disabled={loading || !clientId || sending}
                  aria-label="Atualizar dados"
                  title="Atualizar dados"
                >
                  <RefreshCw size={17} className={loading ? "spin" : ""} />
                </button>
              </div>
            </div>
          )}
          {(view === "overview" || view === "analyst") &&
            report &&
            report.errors.length > 0 && (
              <div className="alert error" role="alert">
                <AlertCircle size={18} />
                <span>
                  Dados parciais.{" "}
                  {report.errors
                    .map(
                      (e) =>
                        `${shortNames[e.provider]} (${e.name}): ${e.error}`,
                    )
                    .join(" ")}
                </span>
              </div>
            )}
          {view === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SUA CENTRAL DE MÍDIA</span>
                  <h1>Clareza para o próximo passo.</h1>
                  <p>
                    Contas conectadas, contexto reunido e análises por cliente.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => navigate("analyst")}
                  disabled={!client}
                >
                  <Sparkles size={16} /> Conversar com analista
                  <ArrowRight size={16} />
                </button>
              </div>
              {boot.mode === "demo" && (
                <div className="demo-strip">
                  <span>
                    <span className="demo-tag">PRÉVIA</span>Explore o fluxo com
                    dados fictícios. Nenhuma conta real está conectada.
                  </span>
                  <button onClick={() => navigate("connections")}>
                    Ver conexões <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {!client ? (
                <Empty
                  title="Comece pelo seu primeiro cliente"
                  text="Cadastre o cliente e depois vincule as contas de mídia e a propriedade GA4."
                  action={
                    <button
                      className="button primary"
                      onClick={() => setEditClient("new")}
                    >
                      <Plus size={16} />
                      Adicionar cliente
                    </button>
                  }
                />
              ) : (
                <>
                  <div className="section-label">
                    <h2>
                      {client.name}
                      <span className="subtle-badge">
                        {client.business === "ecommerce"
                          ? "E-commerce"
                          : "Geração de leads"}
                      </span>
                    </h2>
                    <span>
                      {report
                        ? `${dates(report.range.start)} — ${dates(report.range.end)}`
                        : "Carregando período…"}
                    </span>
                  </div>
                  {reportError && (
                    <div className="alert error" role="alert">
                      <AlertCircle size={17} />
                      {reportError}
                    </div>
                  )}
                  <div className="metric-grid">
                    {(["google_ads", "meta", "ga4"] as Provider[]).map((p) => {
                      const accounts =
                          report?.accounts.filter((a) => a.provider === p) ||
                          [],
                        currencies = [
                          ...new Set(accounts.map((a) => a.currency)),
                        ];
                      const isGA = p === "ga4";
                      const sameCurrency = currencies.length < 2;
                      const val = accounts.reduce(
                        (s, a) =>
                          s +
                          (isGA ? a.totals.sessions || 0 : a.totals.spend || 0),
                        0,
                      );
                      const previous = accounts.reduce(
                        (s, a) =>
                          s +
                          (isGA
                            ? a.previous.sessions || 0
                            : a.previous.spend || 0),
                        0,
                      );
                      const delta = previous
                        ? (val / previous - 1) * 100
                        : null;
                      const failure = report?.errors.some(
                        (a) => a.provider === p,
                      );
                      return (
                        <article className="metric-card" key={p}>
                          <div className="metric-top">
                            <PlatformIcon provider={p} small />
                            <span>{shortNames[p]}</span>
                            <span className="metric-kind">
                              {isGA ? "AUDIÊNCIA" : "INVESTIMENTO"}
                            </span>
                          </div>
                          <div className="metric-value">
                            {loading ? (
                              <span className="skeleton" />
                            ) : failure ? (
                              "Indisponível"
                            ) : !accounts.length ? (
                              "—"
                            ) : !sameCurrency && !isGA ? (
                              "Moedas distintas"
                            ) : isGA ? (
                              count(val)
                            ) : (
                              money(val, currencies[0])
                            )}
                          </div>
                          <div className="metric-footer">
                            {loading ? (
                              <span>Buscando dados…</span>
                            ) : failure ? (
                              <span className="negative">Erro de consulta</span>
                            ) : !accounts.length ? (
                              <button onClick={() => navigate("connections")}>
                                Vincular conta <ArrowRight size={12} />
                              </button>
                            ) : (
                              <>
                                <span>
                                  {isGA
                                    ? "Sessões no site"
                                    : "Por canal, sem somar receitas"}
                                </span>
                                {delta !== null && (
                                  <span className="delta">
                                    <ArrowUpRight size={13} />
                                    {delta > 0 ? "+" : ""}
                                    {delta.toFixed(1)}%
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="overview-grid">
                    <section className="insight-panel">
                      <div className="panel-heading">
                        <div className="heading-icon">
                          <Sparkles size={17} />
                        </div>
                        <h2>Onde vale olhar agora</h2>
                        <span className="subtle-badge">
                          {boot.mode === "demo" ? "Exemplo" : "Leitura inicial"}
                        </span>
                      </div>
                      {loading ? (
                        <div className="chat-loading">
                          <Spinner />
                          Consultando as fontes vinculadas…
                        </div>
                      ) : report?.accounts.length ? (
                        <>
                          <p className="panel-intro">
                            Comparação com os {days} dias anteriores. Um ponto
                            de partida para investigar.
                          </p>
                          {report.accounts
                            .filter((a) => a.provider !== "ga4")
                            .slice(0, 2)
                            .map((a) => {
                              const delta =
                                a.previous.cpa && a.totals.cpa
                                  ? (a.totals.cpa / a.previous.cpa - 1) * 100
                                  : null;
                              return (
                                <div className="insight-row" key={a.id}>
                                  <span
                                    className={`insight-symbol ${delta && delta > 0 ? "attention" : "good"}`}
                                  >
                                    {delta && delta > 0 ? (
                                      <Activity size={16} />
                                    ) : (
                                      <ArrowDownLeft size={16} />
                                    )}
                                  </span>
                                  <div>
                                    <strong>
                                      {shortNames[a.provider]} · custo por
                                      resultado
                                    </strong>
                                    <p>
                                      {delta === null
                                        ? "Sem base comparável no período anterior."
                                        : `${Math.abs(delta).toFixed(1)}% ${delta > 0 ? "acima" : "abaixo"} do período anterior. ${delta > 0 ? "Confira distribuição e evento antes de decidir." : "Verifique qualidade e volume antes de escalar."}`}
                                    </p>
                                  </div>
                                  <ArrowUpRight size={15} />
                                </div>
                              );
                            })}
                          <button
                            className="text-button"
                            onClick={() => void send(suggestions[0].text)}
                            disabled={sending || historyLoading}
                          >
                            Explorar com o analista <ArrowRight size={15} />
                          </button>
                        </>
                      ) : (
                        <Empty
                          title="Faltam dados para analisar"
                          text="Vincule uma conta nas conexões para começar."
                          action={
                            <button
                              className="button"
                              onClick={() => navigate("connections")}
                            >
                              Conectar fontes
                            </button>
                          }
                        />
                      )}
                    </section>
                    <section className="client-context-panel">
                      <div className="panel-heading">
                        <h2>Contexto do cliente</h2>
                        <button
                          className="icon-button"
                          onClick={() => setEditClient(client)}
                          aria-label="Editar contexto"
                        >
                          <Settings2 size={16} />
                        </button>
                      </div>
                      <span className="text-label">OBJETIVO PRINCIPAL</span>
                      <p className="goal-text">
                        {client.goal ||
                          "Adicione o objetivo para orientar suas análises."}
                      </p>
                      <div className="context-divider" />
                      <span className="text-label">FONTES VINCULADAS</span>
                      <div className="source-chips">
                        {(["google_ads", "meta", "ga4"] as Provider[]).map(
                          (p) => (
                            <span
                              key={p}
                              className={`source-chip ${linked.some((a) => a.provider === p) ? "linked" : ""}`}
                            >
                              <PlatformIcon provider={p} small />
                              {shortNames[p]}
                              {linked.some((a) => a.provider === p) ? (
                                <Check size={12} />
                              ) : (
                                <span>—</span>
                              )}
                            </span>
                          ),
                        )}
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("connections")}
                      >
                        Gerenciar vínculos <ArrowRight size={14} />
                      </button>
                    </section>
                  </div>
                  <section className="campaign-section">
                    <div className="section-label">
                      <h2>Campanhas em foco</h2>
                      <span>Maiores investimentos · por plataforma</span>
                    </div>
                    {report &&
                    report.accounts.some((a) => a.provider !== "ga4") ? (
                      <CampaignTable report={report} />
                    ) : (
                      <div className="table-empty">
                        {loading
                          ? "Consultando campanhas…"
                          : "As campanhas aparecem aqui depois que você vincular as contas."}
                      </div>
                    )}
                  </section>
                  <p className="data-footnote">
                    <ShieldCheck size={13} />
                    {boot.mode === "demo"
                      ? "Dados fictícios para explorar a interface."
                      : "Dados consultados sob demanda; o dia atual está excluído."}{" "}
                    Resultados atribuídos não comprovam qualificação ou venda.
                  </p>
                </>
              )}
            </>
          )}
          {view === "clients" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    CONTEXTO QUE ACOMPANHA OS DADOS
                  </span>
                  <h1>Seus clientes.</h1>
                  <p>
                    Organize contas, objetivos e o que significa resultado para
                    cada negócio.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setEditClient("new")}
                >
                  <Plus size={17} /> Novo cliente
                </button>
              </div>
              <div className="list-toolbar">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Buscar clientes"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente…"
                  />
                </label>
                <span>{boot.clients.length} clientes no workspace</span>
              </div>
              <div className="clients-grid">
                {boot.clients
                  .filter((c) =>
                    c.name.toLowerCase().includes(clientSearch.toLowerCase()),
                  )
                  .map((c) => {
                    const ac = boot.accounts.filter((a) => a.clientId === c.id);
                    return (
                      <article className="client-card" key={c.id}>
                        <div className="client-card-header">
                          <Avatar client={c} />
                          <button
                            className="icon-button"
                            onClick={() => setEditClient(c)}
                            aria-label={`Editar ${c.name}`}
                          >
                            <Settings2 size={17} />
                          </button>
                        </div>
                        <h2>{c.name}</h2>
                        <span className="subtle-badge">
                          {c.business === "ecommerce"
                            ? "E-commerce"
                            : "Geração de leads"}
                        </span>
                        <p>
                          {c.goal ||
                            "Defina um objetivo para orientar a análise."}
                        </p>
                        <div className="client-card-sources">
                          {(["google_ads", "meta", "ga4"] as Provider[]).map(
                            (p) => (
                              <span
                                key={p}
                                className={
                                  ac.some((a) => a.provider === p)
                                    ? ""
                                    : "faded"
                                }
                              >
                                <PlatformIcon provider={p} small />
                              </span>
                            ),
                          )}
                          <span>
                            {ac.length}{" "}
                            {ac.length === 1
                              ? "conta vinculada"
                              : "contas vinculadas"}
                          </span>
                        </div>
                        <button
                          className="button full-width"
                          disabled={sending}
                          onClick={() => {
                            chooseClient(c.id);
                            navigate("analyst");
                          }}
                        >
                          Abrir no analista <ArrowRight size={15} />
                        </button>
                      </article>
                    );
                  })}
              </div>
              {!boot.clients.length && (
                <Empty
                  icon={Users}
                  title="Um lugar para cada cliente"
                  text="Cadastre o primeiro cliente para reunir suas fontes de dados."
                />
              )}
            </>
          )}
          {view === "connections" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SUAS FONTES, CONECTADAS</span>
                  <h1>Uma conexão. Mais contexto.</h1>
                  <p>
                    Autorize as plataformas e vincule cada conta ao cliente
                    certo.
                  </p>
                </div>
                <div className="read-only-label">
                  <ShieldCheck size={17} /> Somente leitura
                </div>
              </div>
              <div className="connection-steps">
                <span>
                  <i>1</i> Autorize a plataforma
                </span>
                <ChevronRight size={14} />
                <span>
                  <i>2</i> Escolha as contas
                </span>
                <ChevronRight size={14} />
                <span>
                  <i>3</i> Vincule ao cliente
                </span>
              </div>
              <div className="provider-grid">
                {(["google_ads", "meta", "ga4"] as Provider[]).map((p) => {
                  const cs = boot.connections.filter((c) => c.provider === p),
                    n = boot.accounts.filter((a) => a.provider === p).length;
                  return (
                    <article className="provider-card" key={p}>
                      <div className="provider-card-top">
                        <PlatformIcon provider={p} />
                        <span
                          className={`connection-status ${cs.length ? "connected" : ""}`}
                        >
                          <span />
                          {boot.mode === "demo"
                            ? "Simulado"
                            : cs.length
                              ? "Autorizado"
                              : "Não conectado"}
                        </span>
                      </div>
                      <h2>{platformNames[p]}</h2>
                      <p>
                        {p === "google_ads"
                          ? "Campanhas, investimento e conversões."
                          : p === "meta"
                            ? "Contas de anúncio e resultados de campanhas."
                            : "Sessões, origens e eventos principais do site."}
                      </p>
                      <div className="provider-card-bottom">
                        <span>
                          {n} {p === "ga4" ? "propriedades" : "contas"}{" "}
                          disponíveis
                        </span>
                        <button
                          className={`button ${!cs.length ? "primary" : ""}`}
                          onClick={() => setProviderModal(p)}
                        >
                          {cs.length ? "Gerenciar" : "Conectar"}
                          {cs.length ? (
                            <Settings2 size={14} />
                          ) : (
                            <ArrowRight size={14} />
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="accounts-heading">
                <div>
                  <h2>Contas e propriedades</h2>
                  <p>
                    Uma conta só aparece nas análises depois de ser vinculada a
                    um cliente.
                  </p>
                </div>
                <span className="subtle-badge">
                  {boot.accounts.length} disponíveis
                </span>
              </div>
              <div className="list-toolbar account-toolbar">
                <div
                  className="filter-tabs"
                  role="group"
                  aria-label="Filtrar plataforma"
                >
                  {(["all", "google_ads", "meta", "ga4"] as const).map((p) => (
                    <button
                      key={p}
                      aria-pressed={sourceFilter === p}
                      className={sourceFilter === p ? "selected" : ""}
                      onClick={() => setSourceFilter(p)}
                    >
                      {p === "all" ? "Todas" : shortNames[p]}
                    </button>
                  ))}
                </div>
                <label className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="Buscar contas"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    placeholder="Buscar conta ou ID…"
                  />
                </label>
              </div>
              <div className="account-list">
                {boot.accounts
                  .filter(
                    (a) =>
                      (sourceFilter === "all" || a.provider === sourceFilter) &&
                      `${a.name} ${a.externalId}`
                        .toLowerCase()
                        .includes(accountSearch.toLowerCase()),
                  )
                  .map((a) => (
                    <div className="account-row" key={a.id}>
                      <PlatformIcon provider={a.provider} small />
                      <div className="account-name">
                        <strong>{a.name}</strong>
                        <span>
                          {shortNames[a.provider]} · {a.externalId} ·{" "}
                          {a.currency || "Moeda não informada"}
                        </span>
                      </div>
                      <div className="account-link">
                        <label htmlFor={`link-${a.id}`}>
                          Cliente vinculado
                        </label>
                        <select
                          id={`link-${a.id}`}
                          aria-label={`Cliente de ${a.name} (${shortNames[a.provider]})`}
                          value={a.clientId || ""}
                          disabled={pendingAction === a.id || sending}
                          onChange={(e) => {
                            const value = e.target.value;
                            void perform(a.id, async () => {
                              await api(`/accounts/${a.id}/link`, {
                                method: "POST",
                                body: JSON.stringify({
                                  clientId: value || null,
                                }),
                              });
                              await loadBoot();
                              setNotice(
                                value
                                  ? "Conta vinculada ao cliente."
                                  : "Conta desvinculada.",
                              );
                            });
                          }}
                        >
                          <option value="">Sem vínculo</option>
                          {boot.clients.map((c) => (
                            <option
                              key={c.id}
                              value={c.id}
                              disabled={!!a.clientId && c.id !== a.clientId}
                            >
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span
                        className={`account-state ${a.clientId ? "linked" : ""}`}
                      >
                        {pendingAction === a.id ? (
                          <Spinner />
                        ) : a.clientId ? (
                          <>
                            <Check size={13} />
                            Vinculada
                          </>
                        ) : (
                          "A vincular"
                        )}
                      </span>
                    </div>
                  ))}
              </div>
              {!boot.accounts.length && (
                <Empty
                  title="Suas contas vão aparecer aqui"
                  text="Conecte uma plataforma para descobrir as contas que você pode acessar."
                />
              )}
              <div className="connection-note">
                <ShieldCheck size={20} />
                <div>
                  <strong>Você decide o que o analista pode consultar.</strong>
                  <p>
                    Somente as contas vinculadas ao cliente selecionado entram
                    na análise. Credenciais ficam no servidor.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "analyst" && (
            <>
              <div className="analyst-heading">
                <div>
                  <h1>Seu analista de mídia.</h1>
                  <p>Uma conversa com dados, contexto e próximos passos.</p>
                </div>
                <span className="analyst-engine">
                  <span />
                  {boot.mode === "demo"
                    ? "Respostas de exemplo"
                    : boot.aiConfigured
                      ? "IA configurada"
                      : "IA pendente"}
                </span>
              </div>
              <div className="analyst-layout">
                <section
                  className="chat-panel"
                  aria-label="Conversa com o analista"
                >
                  <div
                    className="chat-transcript"
                    aria-live="polite"
                    aria-busy={sending || historyLoading}
                  >
                    {!client ? (
                      <Empty
                        icon={Users}
                        title="Selecione um cliente"
                        text="Cadastre um cliente para começar sua primeira conversa."
                        action={
                          <button
                            className="button primary"
                            onClick={() => setEditClient("new")}
                          >
                            Adicionar cliente
                          </button>
                        }
                      />
                    ) : historyLoading ? (
                      <div className="chat-loading">
                        <Spinner /> Carregando histórico…
                      </div>
                    ) : !messages.length ? (
                      <div className="chat-welcome">
                        <div className="analyst-symbol">
                          <Sparkles size={27} />
                        </div>
                        <span className="eyebrow">
                          CONTEXTO DE {client.name.toUpperCase()}
                        </span>
                        <h2>O que vamos entender hoje?</h2>
                        <p>
                          {boot.mode === "demo"
                            ? "Explore exemplos de análise com os dados demonstrativos deste cliente."
                            : "Investigue o desempenho, compare períodos ou prepare um fechamento."}
                        </p>
                        <div className="prompt-grid">
                          {suggestions.map(({ icon: Icon, title, text }) => (
                            <button
                              key={title}
                              onClick={() => void send(text)}
                              disabled={sending || !linked.length}
                            >
                              <Icon size={19} />
                              <strong>{title}</strong>
                              <span>{text.split(".")[0]}.</span>
                              <ArrowUpRight size={14} />
                            </button>
                          ))}
                        </div>
                        {!linked.length && (
                          <p className="field-error">
                            Vincule uma conta em Conexões para trazer dados a
                            esta conversa.
                          </p>
                        )}
                      </div>
                    ) : (
                      messages.map((m) => (
                        <article className={`message ${m.role}`} key={m.id}>
                          {m.role === "assistant" && (
                            <div className="assistant-author">
                              <span className="assistant-avatar">
                                <Sparkles size={15} />
                              </span>
                              <strong>Analista Traffic Hub</strong>
                              <span>
                                {m.engine === "demo"
                                  ? "Exemplo demonstrativo"
                                  : "Análise com IA"}
                              </span>
                            </div>
                          )}
                          <div className="message-text">{m.text}</div>
                          {m.role === "assistant" && (
                            <>
                              <details className="message-sources">
                                <summary>
                                  <ShieldCheck size={13} /> Fontes e período{" "}
                                  <ChevronDown size={13} />
                                </summary>
                                <div>
                                  <span>
                                    {dates(m.range.start)} —{" "}
                                    {dates(m.range.end)}
                                  </span>
                                  {m.sources?.map((s) => (
                                    <p key={s.id}>
                                      {shortNames[s.provider]} · {s.name} ·{" "}
                                      {dates(s.range.start)} —{" "}
                                      {dates(s.range.end)}
                                    </p>
                                  ))}
                                </div>
                              </details>
                              <button
                                className="copy-button"
                                onClick={() =>
                                  void navigator.clipboard
                                    .writeText(m.text)
                                    .then(() => setNotice("Resposta copiada."))
                                    .catch(() =>
                                      setError(
                                        "Não foi possível copiar. Selecione o texto manualmente.",
                                      ),
                                    )
                                }
                              >
                                <Copy size={13} />
                                Copiar resposta
                              </button>
                            </>
                          )}
                        </article>
                      ))
                    )}
                    {sending && (
                      <div className="assistant-thinking">
                        <span className="assistant-avatar">
                          <Sparkles size={15} />
                        </span>
                        <Spinner />
                        <span>
                          {boot.mode === "demo"
                            ? "Preparando exemplo com os dados selecionados…"
                            : "Consultando o contexto e preparando a análise…"}
                        </span>
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <label htmlFor="message" className="sr-only">
                      Mensagem para o analista
                    </label>
                    <textarea
                      id="message"
                      placeholder={
                        client
                          ? `Pergunte sobre ${client.name}…`
                          : "Selecione um cliente para conversar…"
                      }
                      value={draft}
                      maxLength={4000}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={!client || sending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-bottom">
                      <span>
                        <ShieldCheck size={12} />
                        {client?.name || "Nenhum cliente"} · {days} dias
                        completos
                      </span>
                      <button
                        className="send-button"
                        disabled={
                          !draft.trim() || sending || historyLoading || !client
                        }
                        aria-label="Enviar mensagem"
                      >
                        {sending ? <Spinner /> : <Send size={17} />}
                      </button>
                    </div>
                  </form>
                  <p className="chat-disclaimer">
                    {boot.mode === "demo"
                      ? "Dados fictícios e respostas de exemplo. A IA generativa não é acionada."
                      : "A IA pode errar. Confira evidências e definições antes de tomar decisões."}{" "}
                    Ctrl + Enter para enviar.
                  </p>
                </section>
                <aside className="analyst-context">
                  <div className="context-section">
                    <h3>
                      <Users size={15} /> Nesta conversa
                    </h3>
                    {client && (
                      <>
                        <div className="context-client">
                          <Avatar client={client} small />
                          <strong>{client.name}</strong>
                        </div>
                        <span className="text-label">OBJETIVO</span>
                        <p>{client.goal || "Objetivo ainda não definido."}</p>
                        <span className="text-label">CONTEXTO ADICIONAL</span>
                        <p>
                          {client.notes ||
                            "Adicione informações sobre o negócio e a definição de resultado."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setEditClient(client)}
                        >
                          Editar contexto <Settings2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="context-section">
                    <h3>
                      <Link2 size={15} /> Fontes da análise
                    </h3>
                    {linked.map((a) => (
                      <div className="context-source" key={a.id}>
                        <PlatformIcon provider={a.provider} small />
                        <div>
                          <strong>{shortNames[a.provider]}</strong>
                          <span>
                            {report?.errors.some((e) => e.accountId === a.id)
                              ? "Erro de consulta"
                              : boot.mode === "demo"
                                ? "Dados demonstrativos"
                                : "Vinculada"}
                          </span>
                        </div>
                        {report?.errors.some((e) => e.accountId === a.id) ? (
                          <AlertCircle size={13} />
                        ) : (
                          <Check size={13} />
                        )}
                      </div>
                    ))}
                    {!linked.length && <p>Nenhuma fonte vinculada.</p>}
                    <button
                      className="text-button"
                      onClick={() => navigate("connections")}
                    >
                      Gerenciar fontes <ArrowRight size={13} />
                    </button>
                  </div>
                  <div className="context-section">
                    <h3>
                      <ShieldCheck size={15} /> Como analisar
                    </h3>
                    <ul>
                      <li>Resultados separados por plataforma.</li>
                      <li>Períodos completos, até ontem.</li>
                      <li>Hipóteses separadas dos fatos.</li>
                      <li>Sem alterações em campanhas.</li>
                    </ul>
                  </div>
                </aside>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            Traffic Hub <span>·</span> Seu workspace de mídia
          </span>
          <span>
            <span className="footer-dot" />
            {boot.mode === "demo"
              ? "Demonstração local"
              : "Consultas sob demanda"}
          </span>
        </footer>
      </div>
      {editClient && (
        <ClientForm
          client={editClient}
          error={error}
          pending={!!pendingAction}
          onClose={() => setEditClient(null)}
          onSave={(data) =>
            void perform("save-client", async () => {
              const saved = await api(
                editClient === "new" ? "/clients" : `/clients/${editClient.id}`,
                {
                  method: editClient === "new" ? "POST" : "PATCH",
                  body: JSON.stringify(data),
                },
              );
              await loadBoot();
              setClientId(saved.id);
              setEditClient(null);
              setNotice(
                editClient === "new"
                  ? "Cliente criado. Agora vincule as contas."
                  : "Contexto atualizado.",
              );
            })
          }
        />
      )}
      {providerModal && (
        <Modal
          title={platformNames[providerModal]}
          onClose={() => setProviderModal(null)}
        >
          <div className="modal-body">
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="provider-modal-intro">
              <PlatformIcon provider={providerModal} />
              <p>
                {boot.mode === "demo"
                  ? "Você está explorando um ambiente demonstrativo. As contas abaixo são fictícias."
                  : "Autorize a plataforma para descobrir suas contas e escolher quais clientes poderão usá-las."}
              </p>
            </div>
            {boot.connections
              .filter((c) => c.provider === providerModal)
              .map((c) => (
                <div className="connection-detail" key={c.id}>
                  <div>
                    <strong>{c.label}</strong>
                    <span>
                      {c.demo
                        ? "Conexão simulada"
                        : c.lastSync
                          ? `Contas atualizadas em ${new Date(c.lastSync).toLocaleString("pt-BR")}`
                          : "Listagem ainda não concluída"}
                    </span>
                    {c.syncError && (
                      <span className="field-error">{c.syncError}</span>
                    )}
                  </div>
                  <div className="connection-detail-actions">
                    <button
                      className="button"
                      disabled={!!pendingAction}
                      onClick={() =>
                        void perform(c.id, async () => {
                          const r = await api(`/connections/${c.id}/sync`, {
                            method: "POST",
                          });
                          await loadBoot();
                          setNotice(`${r.count} contas disponíveis.`);
                        })
                      }
                    >
                      {pendingAction === c.id ? (
                        <Spinner />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Atualizar contas
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label="Remover conexão local"
                      onClick={() => {
                        setProviderModal(null);
                        setRemoveConnection(c);
                      }}
                    >
                      <Unplug size={17} />
                    </button>
                  </div>
                </div>
              ))}
            {(!boot.providers[providerModal].configured ||
              boot.mode === "demo") && (
              <div className="setup-box">
                <strong>
                  {boot.mode === "demo"
                    ? "Para conectar contas reais"
                    : "Configuração necessária no servidor"}
                </strong>
                <p>
                  Preencha as credenciais no arquivo .env, configure os
                  endereços de retorno e inicie o modo real.
                </p>
                <div className="config-fields">
                  {boot.providers[providerModal].missing.map((x) => (
                    <code key={x}>{x}</code>
                  ))}
                </div>
                <p className="text-small">
                  No modo real, também são necessários APP_MODE=live, APP_SECRET
                  e ADMIN_PASSWORD. Veja o guia de instalação no projeto.
                </p>
              </div>
            )}
            <div className="permission-note">
              <ShieldCheck size={16} />
              <span>
                Este aplicativo só consulta dados de anúncios. A autorização das
                plataformas é feita na página oficial.
              </span>
            </div>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={() => {
                setSourceFilter(providerModal);
                setProviderModal(null);
              }}
            >
              Ver contas disponíveis
            </button>
            <button
              className="button primary"
              disabled={
                !boot.providers[providerModal].configured || !!pendingAction
              }
              onClick={() =>
                void perform("oauth", async () => {
                  const r = await api(`/oauth/${providerModal}/start`, {
                    method: "POST",
                  });
                  location.assign(r.url);
                })
              }
            >
              {pendingAction === "oauth" ? (
                <Spinner />
              ) : (
                <ExternalLink size={15} />
              )}{" "}
              Autorizar {shortNames[providerModal]}
            </button>
          </div>
        </Modal>
      )}
      {removeConnection && (
        <Modal
          title="Remover esta conexão?"
          onClose={() => setRemoveConnection(null)}
        >
          <div className="modal-body">
            <p>
              Os vínculos das contas desta conexão serão removidos do workspace.
              As conversas salvas serão preservadas.
            </p>
            <p>
              A autorização na plataforma permanece até você revogá-la nas
              configurações do Google ou da Meta.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={() => setRemoveConnection(null)}
            >
              Cancelar
            </button>
            <button
              className="button destructive"
              disabled={!!pendingAction}
              onClick={() =>
                void perform("remove", async () => {
                  await api(`/connections/${removeConnection.id}/remove`, {
                    method: "POST",
                  });
                  setRemoveConnection(null);
                  await loadBoot();
                  setNotice("Conexão local removida.");
                })
              }
            >
              Remover conexão local
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-symbol">
        <i />
        <i />
        <i />
      </span>
      <span>
        traffic<span className="logo-light">hub</span>
        <span className="logo-period">.</span>
      </span>
    </div>
  );
}
function CampaignTable({ report }: { report: Report }) {
  const rows = report.accounts
    .filter((a) => a.provider !== "ga4")
    .flatMap((a) =>
      a.rows.map((r) => ({
        ...r,
        provider: a.provider,
        currency: a.currency,
        accountId: a.id,
      })),
    )
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))
    .slice(0, 6);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Campanha</th>
            <th>Plataforma</th>
            <th className="numeric">Investimento</th>
            <th className="numeric">Resultados atribuídos</th>
            <th className="numeric">Custo / resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.accountId}-${i}`}>
              <td>
                <strong>{r.name}</strong>
              </td>
              <td>
                <span className="table-platform">
                  <PlatformIcon provider={r.provider} small />
                  {shortNames[r.provider]}
                </span>
              </td>
              <td className="numeric">{money(r.spend || 0, r.currency)}</td>
              <td className="numeric">{count(r.conversions || 0)}</td>
              <td className="numeric">
                {r.conversions
                  ? money((r.spend || 0) / r.conversions, r.currency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ClientForm({
  client,
  error,
  onClose,
  onSave,
  pending,
}: {
  client: Client | "new";
  error: string;
  onClose: () => void;
  onSave: (data: Omit<Client, "id" | "color">) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(client === "new" ? "" : client.name),
    [business, setBusiness] = useState<"leadgen" | "ecommerce">(
      client === "new" ? "leadgen" : client.business,
    ),
    [goal, setGoal] = useState(client === "new" ? "" : client.goal),
    [notes, setNotes] = useState(client === "new" ? "" : client.notes),
    [budget, setBudget] = useState(
      client === "new" ? "" : String(client.monthlyBudget || ""),
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ name, business, goal, notes, monthlyBudget: Number(budget) || 0 });
  };
  return (
    <Modal
      title={client === "new" ? "Novo cliente" : "Contexto do cliente"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body form-fields">
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <label htmlFor="client-name">
            Nome do cliente
            <input
              id="client-name"
              autoFocus={!matchMedia("(pointer: coarse)").matches}
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={90}
              required
              placeholder="Ex.: Studio Casa"
            />
          </label>
          <label htmlFor="business">
            Tipo de negócio
            <select
              id="business"
              value={business}
              onChange={(e) =>
                setBusiness(e.target.value as "leadgen" | "ecommerce")
              }
            >
              <option value="leadgen">Geração de leads</option>
              <option value="ecommerce">E-commerce</option>
            </select>
          </label>
          <label htmlFor="goal">
            Objetivo principal
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={1500}
              placeholder="Qual resultado as campanhas precisam gerar?"
              rows={2}
            />
          </label>
          <label htmlFor="budget">
            Verba mensal de referência (R$)
            <input
              id="budget"
              type="number"
              min={0}
              max={1000000000}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label htmlFor="notes">
            O que o analista precisa saber?
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={4000}
              placeholder="Definição de lead, região, sazonalidade, restrições e contexto comercial…"
              rows={3}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? <Spinner /> : <Check size={16} />}Salvar cliente
          </button>
        </div>
      </form>
    </Modal>
  );
}
