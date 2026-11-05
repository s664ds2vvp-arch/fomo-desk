(function () {
  const $ = (id) => document.getElementById(id);
  const state = { dataPath: null, tab: "home", range: "LIVE", cache: {}, error: null, retry: 5, last: null };

  function hashParams() {
    const h = (location.hash || "").replace(/^#/, "");
    const out = {};
    h.split("&").forEach((part) => {
      const [k, v] = part.split("=");
      if (k && v) out[k] = decodeURIComponent(v);
    });
    return out;
  }

  function loadDataPath() {
    const hp = hashParams();
    if (hp.d) {
      try { localStorage.setItem("desk_data_path", hp.d); } catch (e) {}
      // Strip secret from the visible URL after capture.
      history.replaceState(null, "", location.pathname + location.search);
      return hp.d;
    }
    try { return localStorage.getItem("desk_data_path"); } catch (e) { return null; }
  }

  function base() {
    if (!state.dataPath) return null;
    return `/d/${state.dataPath}`;
  }

  async function getJSON(path) {
    const root = base();
    if (!root) throw new Error("missing data path");
    const r = await fetch(`${root}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
  }

  function showError(msg) {
    const bar = $("errorBar");
    if (!msg) { bar.classList.add("hidden"); bar.textContent = ""; return; }
    bar.classList.remove("hidden");
    bar.textContent = msg;
  }

  function money(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
    const map = { home: "screen-home", agents: "screen-agents", activity: "screen-activity", account: "screen-account", auditor: "screen-auditor", coin: "screen-coin" };
    $(map[tab] || "screen-home").classList.remove("hidden");
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    render();
  }

  function agentCard(a) {
    const el = document.createElement("div");
    el.className = "agent-card";
    let body = "";
    if (a.key === "scanner") {
      body = (a.feed || []).slice(-6).map((f) =>
        `<div class="feed-row ${f.killed ? "killed" : ""}"><span>${escapeHtml(f.name || "")} ${escapeHtml(f.mid || "")}</span><span class="${f.killed ? "why" : ""}">${escapeHtml(f.right || "")}</span></div>`
      ).join("") || `<div class="empty">Listening for graduations</div>`;
    } else if (a.key === "auditor") {
      const layers = (a.layers || []).map((L, i) => {
        const cls = !L ? "" : L.pass ? "ok" : "bad";
        const txt = !L ? "—" : (L.value || "");
        return `<div class="layer ${cls}">${i + 1} ${escapeHtml(txt)}</div>`;
      }).join("");
      body = `<div class="layers">${layers}</div><div class="muted" style="margin-top:8px">${escapeHtml(a.headline || "")} · ${a.rejected || 0} rejected</div>`;
    } else if (a.key === "analyst") {
      body = `<canvas class="ring" width="88" height="88" style="width:88px;height:88px"></canvas><div class="muted">${escapeHtml(a.headline || "Scoring")}</div>`;
    } else if (a.key === "executor") {
      body = `<div>${a.count || 0} trades</div><div class="muted">${a.size != null ? money(a.size) : ""} · ${a.stack_pct || ""}% of stack</div><div class="muted">${escapeHtml(a.headline || "")}</div>`;
    } else if (a.key === "risk") {
      const p = a.pills || {};
      body = `<div>${escapeHtml(a.headline || "Guarding")}</div>
        <div style="margin-top:8px"><span class="pill" style="background:rgba(255,69,58,0.18);color:#ff453a">${escapeHtml(p.stop || "")}</span>
        <span class="pill" style="background:rgba(0,211,90,0.16);color:#00d35a">${escapeHtml(p.trail || "")}</span></div>`;
    }
    el.innerHTML = `<h3 style="color:${a.color || "#fff"}">${escapeHtml(a.name)}</h3>
      <div class="muted">${escapeHtml(a.status || "")}</div>${body}`;
    if (a.key === "analyst") {
      const c = el.querySelector("canvas");
      if (c) setTimeout(() => DeskCharts.drawRing(c, a.score, 70), 0);
    }
    return el;
  }

  function renderHome(s, chart, act) {
    $("paperBadge").classList.toggle("hidden", !(s && s.paper));
    if (s) {
      $("balance").textContent = money(s.balance);
      const pct = s.today_pct;
      const el = $("todayPct");
      el.textContent = (pct >= 0 ? "+" : "") + Number(pct).toFixed(2) + "%";
      el.style.color = pct >= 0 ? "#00d35a" : "#ff453a";
      $("mult").classList.remove("hidden");
      $("mult").textContent = Number(s.multiplier || 1).toFixed(2) + "×";
      const running = (s.agents || []).filter((a) => a.status === "running").length;
      $("agentsRunning").textContent = running + " running";
    }
    const range = state.range;
    const pack = (chart && chart[range]) || { points: [], marks: [], start: null };
    $("homeEmpty").classList.toggle("hidden", (pack.points || []).length > 0 || (s && (s.agents || []).some(a => (a.feed || []).length)));
    DeskCharts.drawLine($("homeChart"), pack.points || [], pack.marks || [], pack.start);
    const row = $("rangeRow");
    if (!row.dataset.ready) {
      ["LIVE", "1H", "4H", "1D", "1W", "ALL"].forEach((r) => {
        const b = document.createElement("button");
        b.textContent = r;
        b.onclick = () => { state.range = r; render(); };
        row.appendChild(b);
      });
      row.dataset.ready = "1";
    }
    [...row.children].forEach((b) => b.classList.toggle("on", b.textContent === state.range));
    const car = $("agentCarousel");
    car.innerHTML = "";
    (s && s.agents ? s.agents : []).forEach((a) => car.appendChild(agentCard(a)));
    renderActivityList($("homeActivity"), (act && act.rows) ? act.rows.slice(0, 5) : []);
  }

  function renderActivityList(node, rows) {
    node.innerHTML = "";
    if (!rows.length && node.id === "activityList") $("activityEmpty").classList.remove("hidden");
    else if (node.id === "activityList") $("activityEmpty").classList.add("hidden");
    rows.forEach((r) => {
      const div = document.createElement("div");
      div.className = "row";
      div.innerHTML = `<div class="t"><div class="title">${escapeHtml(r.title || "")}</div><div class="sub">${escapeHtml(r.subtitle || "")}</div></div><div class="val">${escapeHtml(r.value || "")}</div>`;
      div.onclick = () => {
        if (r.open === "audit") openAuditor(r.mint);
        else openCoin(r.mint);
      };
      node.appendChild(div);
    });
  }

  function renderAgents(s, decisions) {
    const root = $("screen-agents");
    root.innerHTML = "<h2 class='section'>Agents</h2>";
    (s && s.agents ? s.agents : []).forEach((a) => {
      const card = document.createElement("div");
      card.className = "full-card";
      const dec = (decisions[a.key] || []).map((d) =>
        `<div class="row"><div class="t"><div class="title">${escapeHtml(d.verdict || "")} ${escapeHtml((d.mint || "").slice(0, 6))}</div>
         <div class="sub">${escapeHtml(d.ts || "")} · ${escapeHtml(d.reason || "")}</div></div>
         <a class="link" href="${d.coin_url || "#"}" target="_blank" rel="noopener">FOMO</a></div>`
      ).join("") || "<div class='muted'>No decisions yet</div>";
      card.innerHTML = `<div><span class="status-dot ${a.status === "running" ? "" : "off"}"></span><strong>${escapeHtml(a.name)}</strong> · ${escapeHtml(a.status || "")}</div>
        <div class="muted" style="margin:8px 0">${escapeHtml(a.headline || "")} · today ${a.count || 0}</div>
        ${dec}`;
      root.appendChild(card);
    });
  }

  function renderAccount(acc, settings) {
    const root = $("screen-account");
    const groups = {};
    Object.keys(settings || {}).forEach((k) => {
      const g = k.split(".")[0];
      (groups[g] = groups[g] || []).push(k);
    });
    root.innerHTML = `
      <h2 class="section">Account</h2>
      <div class="full-card">
        <div>Mode · <strong>${escapeHtml((acc && acc.mode) || "PAPER")}</strong>
          ${(acc && acc.mode) === "PAPER" ? '<span class="pill paper">PAPER</span>' : ""}</div>
        <div class="muted" style="margin-top:8px">Stack ${money(acc && acc.stack)}</div>
        <div style="margin-top:12px"><a class="link" id="prof" target="_blank" rel="noopener">Your FOMO profile</a></div>
        <div style="margin-top:8px"><button class="btn" id="invite" style="width:100%;margin:8px 0">Invite a friend</button></div>
        <div class="muted">Telegram: ${escapeHtml((acc && acc.telegram) || "not connected")}</div>
        <div class="muted">Notifications: ${escapeHtml((acc && acc.webpush) || "unavailable (plan B)")}</div>
        <div class="muted" style="margin-top:8px">Settings are read-only on this host.</div>
      </div>`;
    if (acc && acc.profile_url) $("prof").href = acc.profile_url;
    const invite = acc && acc.signup_url;
    $("invite").onclick = async () => {
      if (navigator.share && invite) {
        try { await navigator.share({ url: invite, title: "FOMO" }); return; } catch (e) {}
      }
      if (invite) {
        try { await navigator.clipboard.writeText(invite); alert("Link copied"); } catch (e) { alert(invite); }
      }
    };
    Object.keys(groups).forEach((g) => {
      const box = document.createElement("div");
      box.className = "settings-group";
      box.innerHTML = `<h3>${escapeHtml(g)}</h3>` + groups[g].map((k) =>
        `<div class="set-row">${escapeHtml(k.split(".").slice(1).join(".") || k)}<span>${escapeHtml(String(settings[k]))}</span></div>`
      ).join("");
      root.appendChild(box);
    });
  }

  async function openAuditor(mint) {
    if (!mint) return;
    switchTab("auditor");
    const root = $("screen-auditor");
    root.innerHTML = "<div class='empty'>Loading…</div>";
    try {
      const a = await getJSON(`/audit/${mint}.json`);
      const layers = (a.layers || []).map((L) =>
        `<div class="row"><div class="disc ${L.pass === true ? "ok" : L.pass === false ? "bad" : ""}">${L.n}</div>
         <div class="t"><div class="title">${escapeHtml(L.name || "")}</div><div class="sub">${escapeHtml(L.value || "")}</div></div></div>`
      ).join("");
      const status = a.passed ? `Cleared · 8/8 parts` : `Rejected · ${a.reason || ""}`;
      root.innerHTML = `<h2 class="section">${escapeHtml(a.name || mint)}</h2>
        <div class="muted" style="padding:0 16px">${escapeHtml(status)}</div>
        ${layers || "<div class='empty'>No coin taken apart yet</div>"}
        <a class="btn" style="text-align:center;line-height:50px;text-decoration:none" href="${a.coin_url || "#"}" target="_blank" rel="noopener">Open on FOMO</a>`;
    } catch (e) {
      root.innerHTML = "<div class='empty'>No coin taken apart yet</div>";
    }
  }

  async function openCoin(mint) {
    if (!mint) return;
    switchTab("coin");
    const root = $("screen-coin");
    root.innerHTML = "<div class='empty'>Loading…</div>";
    try {
      const c = await getJSON(`/coin/${mint}.json`);
      const pos = c.position;
      const btnLabel = pos && (pos.status === "open" || pos.status === "exiting") ? "Sell on FOMO" : "Buy on FOMO";
      root.innerHTML = `
        <div style="padding:0 16px" class="muted">${escapeHtml(c.symbol || "")} · ${escapeHtml(c.chain || "Solana")} · ${c.age_min != null ? c.age_min + "m old" : ""}
          ${c.shield ? `<span class="pill">${escapeHtml(c.shield)}</span>` : ""}
          <span id="coinPaper"></span>
        </div>
        <h2 class="section" style="margin-bottom:4px">${escapeHtml(c.name || mint)}</h2>
        <div class="price">${c.price != null ? Number(c.price).toPrecision(6) : "—"}</div>
        <canvas class="coin-chart" id="coinChart"></canvas>
        <div class="stats">
          <div><div class="k">Market cap</div><div class="v">${c.stats && c.stats.marketCap != null ? money(c.stats.marketCap) : "—"}</div></div>
          <div><div class="k">Liquidity</div><div class="v">${c.stats && c.stats.liquidity != null ? money(c.stats.liquidity) : "—"}</div></div>
          <div><div class="k">24h volume</div><div class="v">${c.stats && c.stats.volume_h24 != null ? money(c.stats.volume_h24) : "—"}</div></div>
          <div><div class="k">Holders</div><div class="v">${c.stats && c.stats.holders != null ? escapeHtml(String(c.stats.holders)) : "n/a"}</div></div>
        </div>
        ${pos && pos.status ? `<div class="full-card">Your position · ${money(pos.size_usd)} in · Executor
          <div class="muted">stop ${pos.stop_price != null ? Number(pos.stop_price).toPrecision(6) : "—"} · trail ${c.exit && c.exit.trail != null ? Number(c.exit.trail).toPrecision(6) : "—"}</div></div>` : ""}
        <a class="btn" style="text-align:center;line-height:50px;text-decoration:none" href="${c.coin_url || "#"}" target="_blank" rel="noopener">${btnLabel}</a>`;
      if (state.cache.state && state.cache.state.paper) {
        const badge = document.createElement("span");
        badge.className = "pill paper";
        badge.textContent = "PAPER";
        const slot = $("coinPaper");
        if (slot) slot.appendChild(badge);
      }
      DeskCharts.drawCandles($("coinChart"), c.candles || [], (c.exit && (c.exit.trail || c.exit.stop)) || null);
    } catch (e) {
      root.innerHTML = "<div class='empty'>Coin not found</div>";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function render() {
    const s = state.cache.state, c = state.cache.chart, a = state.cache.activity;
    if (state.tab === "home") renderHome(s, c, a);
    if (state.tab === "agents") renderAgents(s, state.cache.decisions || {});
    if (state.tab === "activity") renderActivityList($("activityList"), (a && a.rows) || []);
    if (state.tab === "account") renderAccount(state.cache.account, state.cache.settings);
  }

  async function poll() {
    try {
      if (!state.dataPath) throw new Error("missing data path");
      const [st, ch, act, acc, settings] = await Promise.all([
        getJSON("/state.json"),
        getJSON("/chart.json"),
        getJSON("/activity.json"),
        getJSON("/account.json"),
        getJSON("/settings.json"),
      ]);
      const decisions = {};
      await Promise.all(["scanner", "auditor", "analyst", "executor", "risk"].map(async (n) => {
        try { decisions[n] = (await getJSON(`/agents/${n}.json`)).decisions || []; } catch (e) { decisions[n] = []; }
      }));
      state.cache = { state: st, chart: ch, activity: act, account: acc, settings, decisions };
      state.last = new Date();
      state.error = null;
      showError(null);
      render();
    } catch (e) {
      state.error = e;
      const t = state.last ? state.last.toLocaleTimeString() : "never";
      showError(`Desk offline · retrying in ${state.retry}s · last update ${t}`);
    }
  }

  function bind() {
    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    $("avatarBtn").addEventListener("click", () => switchTab("account"));
  }

  state.dataPath = loadDataPath();
  bind();
  if (!state.dataPath) {
    showError("Open this app with the secret link (#d=…) once so it can load your desk.");
  } else {
    poll();
    setInterval(poll, 5000);
  }
})();
