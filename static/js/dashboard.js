/* ── Supertrend EA Dashboard ─────────────────────────────────── */

const STATE = { data: null, view: "aligned", charts: {} };

const COLOR = {
  primary:     "#3565ff",
  primarySoft: "rgba(53,101,255,0.12)",
  gold:        "#f2b43a",
  goldSoft:    "rgba(242,180,58,0.16)",
  danger:      "#ef4f4f",
  dangerSoft:  "rgba(239,79,79,0.18)",
  success:     "#14b87a",
  grid:        "rgba(120,128,150,0.12)",
  text:        "#6b7388",
};

const fmtPct    = v => (v == null || Number.isNaN(v)) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtPctRaw = v => (v == null || Number.isNaN(v)) ? "—" : `${v.toFixed(2)}%`;
const fmtNum    = (v, d = 2) => (v == null || Number.isNaN(v)) ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney  = v => (v == null || Number.isNaN(v)) ? "—" : "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

/* ── Error banner ─────────────────────────────────────────────── */
function showError(msg, err) {
  console.error("[dashboard]", msg, err);
  let bar = document.getElementById("errBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "errBar";
    bar.style.cssText = "position:fixed;top:0;left:0;right:0;background:#ef4f4f;color:#fff;padding:10px 16px;font:13px/1.4 Inter;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25)";
    document.body.appendChild(bar);
  }
  bar.textContent = `⚠ ${msg}` + (err ? `  —  ${err.message || err}` : "");
}

window.addEventListener("error", e => showError("JS error", e.error || e.message));
window.addEventListener("unhandledrejection", e => showError("Promise rejection", e.reason));

/* ── Highstock helpers ────────────────────────────────────────── */
function toHCData(points) {
  // [[ms, y], ...]; skip null y so Highcharts draws a gap
  return points.map(p => [Date.parse(p.x), p.y]).filter(p => p[1] != null && !Number.isNaN(p[1]));
}

function destroyHC(name) {
  if (STATE.charts[name] && typeof STATE.charts[name].destroy === "function") {
    STATE.charts[name].destroy();
  }
  STATE.charts[name] = null;
}

// Remember each chart's zoom selection across re-renders (theme toggle, refresh,
// view switch). Without this, every render snaps the chart back to "All".
STATE.zoomMemory = STATE.zoomMemory || {};

function hcBase(extra, chartKey) {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const bg   = dark ? "#161a23" : "#ffffff";
  const txt  = dark ? "#97a0b5" : "#6b7388";
  const grid = dark ? "rgba(150,160,180,0.08)" : "rgba(120,128,150,0.12)";

  // Persist this chart's zoom range whenever the user changes it
  const onSetExtremes = function (e) {
    if (e.trigger === "rangeSelectorButton" || e.trigger === "navigator" ||
        e.trigger === "zoom" || e.trigger === "pan") {
      STATE.zoomMemory[chartKey] = { min: e.min, max: e.max };
    }
  };

  const onLoad = function () {
    const saved = STATE.zoomMemory[chartKey];
    if (saved && saved.min != null && saved.max != null) {
      this.xAxis[0].setExtremes(saved.min, saved.max, true, false);
    }
  };

  return Highcharts.merge({
    chart: {
      backgroundColor: bg,
      style: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" },
      animation: { duration: 350 },
      spacing: [10, 6, 8, 6],
      zooming: { type: "x", singleTouch: false }, // mobile: require 2-finger zoom so single-finger scroll works
      panning: { enabled: true, type: "x" },
      panKey: "shift",                            // hold shift to pan; plain drag = zoom box
      resetZoomButton: {
        position: { align: "right", verticalAlign: "top", x: -10, y: 8 },
        theme: {
          fill: "#3565ff", stroke: "transparent", r: 6,
          style: { color: "#fff", fontWeight: "600" },
          states: { hover: { fill: "#2851d0" } },
        },
      },
      events: { load: onLoad },
    },
    credits: { enabled: false },
    legend:  { enabled: false },
    rangeSelector: {
      enabled: true,
      buttons: [
        { type: "month", count: 3, text: "3M" },
        { type: "month", count: 6, text: "6M" },
        { type: "ytd",             text: "YTD" },
        { type: "year",  count: 1, text: "1Y" },
        { type: "year",  count: 3, text: "3Y" },
        { type: "all",             text: "All" },
      ],
      // Default to "All" — full window visible
      selected: 5,
      inputEnabled: false,
      buttonTheme: {
        fill: dark ? "#1a1f2a" : "#f4f6fb",
        stroke: "transparent",
        r: 6,
        style: { color: txt, fontWeight: "500", fontSize: "11px" },
        states: {
          hover:    { fill: "#3565ff", style: { color: "#fff" } },
          select:   { fill: "#3565ff", style: { color: "#fff" } },
          disabled: { style: { color: txt } },
        },
      },
      labelStyle: { color: txt, fontSize: "11px" },
    },
    navigator: {
      enabled: true,
      height: 36,
      maskFill: "rgba(53,101,255,0.14)",
      outlineColor: "transparent",
      handles: {
        backgroundColor: "#3565ff",
        borderColor: "#3565ff",
        height: 18, width: 9,
      },
      series: { color: "#3565ff", lineColor: "#3565ff" },
      xAxis: { labels: { style: { color: txt, fontSize: "10px" } } },
    },
    scrollbar: { enabled: false },
    xAxis: {
      labels: { style: { color: txt, fontSize: "11px" } },
      lineColor: grid,
      tickColor: grid,
      crosshair: { color: "rgba(53,101,255,0.35)", dashStyle: "ShortDot", width: 1 },
      events: { setExtremes: onSetExtremes },
    },
    tooltip: {
      backgroundColor: "rgba(20,30,60,0.95)",
      borderColor: "transparent",
      borderRadius: 8,
      style: { color: "#fff", fontSize: "12px" },
      shared: true,
      split: false,
      valueDecimals: 2,
    },
    plotOptions: {
      series: { animation: { duration: 400 }, marker: { enabled: false }, states: { hover: { lineWidth: 3 } } },
      area:   { lineWidth: 2.2 },
      line:   { lineWidth: 2.2 },
    },
  }, extra);
}

/* ── Bootstrap ────────────────────────────────────────────────── */
async function boot() {
  try {
    setupTheme();
    if (typeof Chart === "undefined")      { showError("Chart.js failed to load (CDN blocked?)"); return; }
    if (typeof Highcharts === "undefined") { showError("Highcharts failed to load (CDN blocked?)"); return; }

    console.log("[dashboard] fetching /data.json");
    const res  = await fetch("/data.json", { cache: "no-store" });
    if (!res.ok) { showError(`API ${res.status}`); return; }
    STATE.data = await res.json();
    console.log("[dashboard] data ok", { years: Object.keys(STATE.data.monthly_returns), aligned_pts: STATE.data.aligned.strategy_norm.length });
    STATE._mcCache = null;
    render();

    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.classList.add("spinning");
        try {
          await fetch("/api/refresh");
          const r = await fetch("/api/data", { cache: "no-store" });
          STATE.data = await r.json();
          STATE._mcCache = null;
          render();
        } finally {
          setTimeout(() => refreshBtn.classList.remove("spinning"), 400);
        }
      });
    }

    setupScrollSpy();
    setupChartShades();
    setupSmoothMotion();
  } catch (err) { showError("Boot failed", err); }
}

/* ── Click-to-engage chart shades ─────────────────────────────
   Charts are "shielded" by an invisible overlay. Hovering shows
   a "Click to interact" pill; clicking dismisses the shield and
   the chart becomes fully interactive. When the chart scrolls
   out of the viewport, the shield comes back so the user can
   scroll past the next chart without accidental zoom/pan.       */
function setupChartShades() {
  const shades = Array.from(document.querySelectorAll(".chart-shade"));
  if (!shades.length) return;

  shades.forEach(shade => {
    const wrap = shade.parentElement;
    let tag = wrap.querySelector(".chart-engaged-tag");
    if (!tag) {
      tag = document.createElement("button");
      tag.type = "button";
      tag.className = "chart-engaged-tag";
      tag.innerHTML = '<span class="dot"></span>INTERACTIVE <span class="x">×</span>';
      tag.title = "Exit interactive mode (or press ESC)";
      tag.addEventListener("click", e => {
        e.stopPropagation();
        engageShade(shade, false);
      });
      wrap.appendChild(tag);
    }
    shade.addEventListener("click", () => engageShade(shade, true));
  });

  // Press ESC anywhere to exit ALL engaged charts
  if (!STATE._escBound) {
    STATE._escBound = true;
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".chart-wrap.engaged .chart-shade")
        .forEach(s => engageShade(s, false));
    });
  }

  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) {
        const shade = e.target.querySelector(".chart-shade");
        if (shade) engageShade(shade, false);
      }
    });
  }, { threshold: 0 });

  document.querySelectorAll(".chart-wrap").forEach(w => io.observe(w));
}

function engageShade(shade, on) {
  const wrap = shade.parentElement;
  shade.classList.toggle("active", on);
  wrap.classList.toggle("engaged", on);
}

function setupScrollSpy() {
  const items = Array.from(document.querySelectorAll(".nav-item[href^='#']"));
  const byId  = new Map(items.map(a => [a.getAttribute("href").slice(1), a]));
  const targets = items
    .map(a => document.getElementById(a.getAttribute("href").slice(1)))
    .filter(Boolean);

  if (!targets.length || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const a = byId.get(e.target.id);
      if (!a) return;
      items.forEach(x => x.classList.remove("active"));
      a.classList.add("active");
    });
  }, { rootMargin: "-30% 0px -55% 0px", threshold: 0 });

  targets.forEach(t => io.observe(t));

  // Clicking a nav link feels nicer with the highlight following immediately
  items.forEach(a => a.addEventListener("click", () => {
    items.forEach(x => x.classList.remove("active"));
    a.classList.add("active");
  }));
}

function setupTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeIcon").textContent = saved === "dark" ? "☾" : "☼";
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur  = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    document.getElementById("themeIcon").textContent = next === "dark" ? "☾" : "☼";
    if (STATE.data) render();
  });
}

/* ── Main render ──────────────────────────────────────────────── */
function render() {
  try {
    const d = STATE.data;
    const view = STATE.view;

    // ── Period labels
    if (view === "aligned") {
      setText("periodLabel",      `Aligned period: ${d.period.aligned_start} → ${d.period.aligned_end}  ·  ${d.period.years_aligned.toFixed(2)} yrs`);
      setText("periodPill",       `${d.period.aligned_start} · ${d.period.aligned_end}`);
      setText("alignedRangeLabel",`Aligned window — both curves rebased to 100`);
      setText("comparePeriodLabel",`Aligned: ${d.period.aligned_start} → ${d.period.aligned_end}`);
      setText("ddPeriodLabel",    `Strategy vs Gold (peak-to-trough %) · aligned window`);
    } else {
      setText("periodLabel",      `Full backtest: ${d.period.start} → ${d.period.end}  ·  ${d.period.years_full.toFixed(2)} yrs`);
      setText("periodPill",       `${d.period.start} · ${d.period.end}`);
      setText("alignedRangeLabel",`Full strategy curve (gold series shown where overlapping)`);
      setText("comparePeriodLabel",`Full: ${d.period.start} → ${d.period.end}`);
      setText("ddPeriodLabel",    `Strategy only (peak-to-trough %) · full period`);
    }

    // Save shade engagement state before charts are torn down, then restore.
    const wasEngaged = new Set(
      Array.from(document.querySelectorAll(".chart-wrap.engaged"))
        .map(w => w.querySelector("[id^='chart']")?.id)
    );

    renderKPIs();
    renderEquityChart();
    renderRawChart();
    renderWeekdayChart();
    renderComparisonTable();
    renderDependence();
    renderMonteCarlo();

    // Re-apply engagement (e.g., user had clicked into a chart before theme toggle)
    wasEngaged.forEach(id => {
      const wrap = document.getElementById(id)?.parentElement;
      const shade = wrap?.querySelector(".chart-shade");
      if (shade) engageShade(shade, true);
    });

    // Chart heights may have changed — let ScrollTrigger recompute positions
    if (typeof ScrollTrigger !== "undefined") {
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }
    renderGauge();
    renderDrawdown();
    renderTradeStats();
    renderHeatmap();
  } catch (err) { showError("Render failed", err); }
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/* ── KPI cards ───────────────────────────────────────────────── */
function renderKPIs() {
  const d = STATE.data;
  const view = STATE.view;
  const ms = view === "aligned" ? d.aligned.metrics_strategy : d.strategy_full.metrics;
  const mg = view === "aligned" ? d.aligned.metrics_gold     : null;

  setKPI("totalReturn", fmtPctRaw(ms.total_return), mg && ratioArrow(ms.total_return, mg.total_return),
                        mg && fmtPctRaw(mg.total_return));
  setKPI("cagr",        fmtPctRaw(ms.cagr),         mg && ratioArrow(ms.cagr,         mg.cagr),
                        mg && fmtPctRaw(mg.cagr));
  setKPI("maxdd",       fmtPctRaw(ms.max_drawdown), mg && ratioArrow(ms.max_drawdown, mg.max_drawdown, true),
                        mg && fmtPctRaw(mg.max_drawdown));
  setKPI("calmar",      fmtNum(ms.calmar, 2),       mg && ratioArrow(ms.calmar,       mg.calmar),
                        mg && fmtNum(mg.calmar, 2));
}

function setKPI(key, value, delta, goldValue) {
  setText(`kpi_${key}`, value);
  setText(`kpi_${key}_g`, goldValue || "—");
  const el = document.getElementById(`kpi_${key}_delta`);
  if (!el) return;
  if (!delta) { el.textContent = "—"; el.className = "delta"; return; }
  el.textContent = delta.text;
  el.className   = "delta " + (delta.positive ? "up" : "down");
}

function diffArrow(a, b, lessIsBetter = false) {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = a - b;
  const positive = lessIsBetter ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "▲ +" : "▼ ";
  return { text: `${sign}${Math.abs(diff).toFixed(2)}`, positive };
}

// Ratio (strategy / gold) — what the user sees in KPI deltas.
// For "lessIsBetter" metrics (drawdown), ratio > 1 means strategy is WORSE.
function ratioArrow(strat, gold, lessIsBetter = false) {
  if (strat == null || gold == null || Number.isNaN(strat) || Number.isNaN(gold)) return null;
  const ag = Math.abs(gold);
  if (ag < 1e-9) return null;                        // avoid divide-by-zero
  const ratio    = Math.abs(strat) / ag;
  const positive = lessIsBetter ? ratio < 1 : ratio > 1;
  const arrow    = ratio >= 1 ? "▲" : "▼";
  return { text: `${arrow} ${ratio.toFixed(2)}×`, positive };
}

/* ── Equity chart (Highstock) ────────────────────────────────── */
function renderEquityChart() {
  const d = STATE.data;
  const view = STATE.view;
  const strat = view === "aligned" ? d.aligned.strategy_norm : d.strategy_full.curve;
  const gold  = d.aligned.gold_norm;

  destroyHC("equity");
  STATE.charts.equity = Highcharts.stockChart("chartEquity", hcBase({
    title: null,
    yAxis: [{
      title: { text: "Index (start = 100)", style: { color: COLOR.text, fontSize: "11px" } },
      opposite: true,
      labels: { style: { color: COLOR.text, fontSize: "11px" } },
      gridLineColor: COLOR.grid,
    }],
    series: [
      {
        name: "Supertrend EA",
        type: "area",
        data: toHCData(strat),
        color: COLOR.primary,
        lineWidth: 2.4,
        fillColor: {
          linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
          stops: [[0, "rgba(53,101,255,0.35)"], [1, "rgba(53,101,255,0.00)"]],
        },
        tooltip: { valueDecimals: 2, valueSuffix: "" },
      },
      {
        name: "XAUUSD Buy & Hold",
        type: "line",
        data: toHCData(gold),
        color: COLOR.gold,
        lineWidth: 2.4,
        dashStyle: "Solid",
        tooltip: { valueDecimals: 2 },
      },
    ],
  }, "equity"));
}

/* ── Raw equity ($) vs gold price — Highstock dual-axis ──────── */
function renderRawChart() {
  const d    = STATE.data;
  const view = STATE.view;
  const stratData = view === "aligned" ? d.aligned.strategy_raw : d.strategy_full.balance;
  const goldData  = d.aligned.gold_price;

  destroyHC("raw");

  const series = [
    {
      name: "Strategy Equity",
      type: "area",
      yAxis: 0,
      data: toHCData(stratData),
      color: COLOR.primary,
      lineWidth: 2.4,
      fillColor: {
        linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
        stops: [[0, "rgba(53,101,255,0.30)"], [1, "rgba(53,101,255,0.00)"]],
      },
    },
    {
      name: "Gold (USD/oz)",
      type: "line",
      yAxis: 1,
      data: toHCData(goldData),
      color: COLOR.gold,
      lineWidth: 2.4,
    },
  ];

  STATE.charts.raw = Highcharts.stockChart("chartRaw", hcBase({
    title: null,
    yAxis: [
      {
        title: { text: "Equity ($)", style: { color: COLOR.primary, fontSize: "11px", fontWeight: "600" } },
        opposite: false,
        labels: {
          style: { color: COLOR.primary, fontSize: "11px", fontWeight: "600" },
          formatter: function () { return "$" + Math.round(this.value / 1000) + "k"; },
        },
        gridLineColor: COLOR.grid,
      },
      {
        title: { text: "Gold (USD/oz)", style: { color: COLOR.gold, fontSize: "11px", fontWeight: "600" } },
        opposite: true,
        labels: {
          style: { color: COLOR.gold, fontSize: "11px", fontWeight: "600" },
          formatter: function () { return "$" + Math.round(this.value); },
        },
        gridLineWidth: 0,
      },
    ],
    tooltip: {
      split: false,
      shared: true,
      useHTML: true,
      backgroundColor: "rgba(20,30,60,0.95)",
      borderColor: "transparent",
      style: { color: "#fff", fontSize: "12px" },
      formatter: function () {
        const date = Highcharts.dateFormat("%Y-%m-%d", this.x);
        let html = `<div style="font-weight:600;margin-bottom:4px">${date}</div>`;
        this.points.forEach(p => {
          const isEq = p.series.options.yAxis === 0;
          const v = isEq
            ? "$" + Math.round(p.y).toLocaleString()
            : "$" + p.y.toFixed(2) + " / oz";
          html += `<div style="color:${p.color}">● ${p.series.name}: <b>${v}</b></div>`;
        });
        return html;
      },
    },
    series,
  }, "raw"));
}

/* ── Yearly returns bar chart ─────────────────────────────────── */
function renderWeekdayChart() {
  const d = STATE.data.monthly_returns;
  const years = Object.keys(d).sort();
  const yearlyTotals = years.map(y => {
    const m = d[y];
    return Object.values(m).reduce((acc, v) => acc * (1 + v / 100), 1) * 100 - 100;
  });

  destroyChart("weekday");
  const ctx = document.getElementById("chartWeekday").getContext("2d");
  const bestIdx = yearlyTotals.indexOf(Math.max(...yearlyTotals));
  const colors  = yearlyTotals.map((v, i) =>
    v < 0 ? COLOR.danger
          : i === bestIdx ? COLOR.primary
          : COLOR.primarySoft
  );

  STATE.charts.weekday = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [{
        label: "Annual %",
        data: yearlyTotals,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${Number(c.parsed.y).toFixed(2)}%` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLOR.text, font: { size: 11 } } },
        y: { grid: { color: COLOR.grid }, ticks: { color: COLOR.text, font: { size: 11 }, callback: v => v + "%" } },
      },
    },
  });
}

/* ── Comparison table ────────────────────────────────────────── */
function renderComparisonTable() {
  const d    = STATE.data;
  const view = STATE.view;
  const ms = view === "aligned" ? d.aligned.metrics_strategy : d.strategy_full.metrics;
  const mg = view === "aligned" ? d.aligned.metrics_gold     : null;

  const rows = [
    { k: "Total Return", s: ms.total_return, g: mg?.total_return, fmt: fmtPctRaw,         higherBetter: true  },
    { k: "CAGR",         s: ms.cagr,         g: mg?.cagr,         fmt: fmtPctRaw,         higherBetter: true  },
    { k: "Max Drawdown", s: ms.max_drawdown, g: mg?.max_drawdown, fmt: fmtPctRaw,         higherBetter: true  },
    { k: "Calmar Ratio", s: ms.calmar,       g: mg?.calmar,       fmt: v => fmtNum(v, 2), higherBetter: true  },
    { k: "Sharpe Ratio", s: ms.sharpe,       g: mg?.sharpe,       fmt: v => fmtNum(v, 2), higherBetter: true  },
    { k: "Volatility",   s: ms.volatility,   g: mg?.volatility,   fmt: fmtPctRaw,         higherBetter: false },
  ];

  const body = document.getElementById("cmpBody");
  body.innerHTML = "";
  rows.forEach(r => {
    const hasGold = r.g != null && !Number.isNaN(r.g);
    const better  = hasGold ? (r.higherBetter ? r.s >= r.g : r.s <= r.g) : true;
    const edge    = hasGold ? r.s - r.g : null;
    const isPct   = (r.fmt === fmtPctRaw);
    const edgeStr = edge == null ? "—"
      : (edge >= 0 ? "+" : "") + (isPct ? edge.toFixed(2) + "%" : edge.toFixed(2));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.k}</td>
      <td class="num">${r.fmt(r.s)}</td>
      <td class="num">${hasGold ? r.fmt(r.g) : "—"}</td>
      <td class="num ${edge == null ? "" : better ? "edge-up" : "edge-down"}">${edgeStr}</td>`;
    body.appendChild(tr);
  });
}

/* ── Gold dependence card ───────────────────────────────────── */
function renderDependence() {
  const dep = STATE.data.aligned.gold_dependence;
  if (!dep) return;

  // Stash for re-renders on switcher click
  STATE.depHorizon = STATE.depHorizon || "monthly";
  renderDepHorizon(STATE.depHorizon);

  // Table rows for all three horizons
  const tbody = document.getElementById("depTbody");
  if (tbody) {
    const rows = ["daily", "weekly", "monthly"].map(h => {
      const d = dep[h] || {};
      const active = h === STATE.depHorizon ? " class=\"active\"" : "";
      const label = h[0].toUpperCase() + h.slice(1);
      return `<tr${active}>
        <td>${label}</td>
        <td class="num">${d.n ?? "—"}</td>
        <td class="num">${fmtNum(d.correlation, 3)}</td>
        <td class="num">${fmtNum(d.beta, 2)}</td>
        <td class="num">${fmtPct(d.alpha_annual)}</td>
      </tr>`;
    }).join("");
    tbody.innerHTML = rows;
  }

  // Segment switcher wiring (idempotent)
  const seg = document.getElementById("depSeg");
  if (seg && !seg.dataset.wired) {
    seg.dataset.wired = "1";
    seg.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        STATE.depHorizon = b.dataset.h;
        seg.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
        renderDependence();
      });
    });
  }
}

function renderDepHorizon(h) {
  const d = STATE.data.aligned.gold_dependence[h] || {};
  const r2    = d.r_squared    ?? 0;
  const corr  = d.correlation  ?? 0;
  const beta  = d.beta         ?? 0;
  const alpha = d.alpha_annual ?? 0;

  setText("depCorr",  fmtNum(corr, 3));
  setText("depBeta",  fmtNum(beta, 2));
  setText("depAlpha", fmtPct(alpha));
  setText("depFreqLabel", h);

  setText("depSub",
    `OLS regression of ${h} strategy returns on ${h} XAUUSD returns · n = ${d.n ?? "—"} observations`);

  let verdict, hint, cls;
  if (r2 < 0.15) {
    verdict = "Independent";
    hint    = `Strategy returns are largely independent of gold at ${h} horizon.`;
    cls     = "independent";
  } else if (r2 < 0.4) {
    verdict = "Partial overlap";
    hint    = `Some ${h} return is explained by gold, but most comes from the strategy.`;
    cls     = "partial";
  } else if (r2 < 0.7) {
    verdict = "Mostly gold-driven";
    hint    = `Much of the ${h} P&L tracks gold direction.`;
    cls     = "dependent";
  } else {
    verdict = "Essentially long gold";
    hint    = `${h.charAt(0).toUpperCase()}${h.slice(1)} returns behave like a leveraged buy-and-hold of gold.`;
    cls     = "dependent";
  }
  const tag = document.getElementById("depVerdict");
  if (tag) { tag.textContent = verdict; tag.className = "dep-tag " + cls; }
}

/* ── Win-rate gauge ─────────────────────────────────────────── */
function renderGauge() {
  const r = STATE.data.report;
  const win = r.win_rate || 0;

  destroyChart("gauge");
  const ctx = document.getElementById("chartGauge").getContext("2d");
  const segments = 40;
  const filled   = Math.max(0, Math.round((win / 100) * segments));

  STATE.charts.gauge = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: Array(segments).fill(1),
        backgroundColor: Array.from({ length: segments }, (_, i) => {
          if (i >= filled) return "rgba(120,128,150,0.12)";
          const t = filled > 1 ? i / (filled - 1) : 0;
          return interpolateColor("#3565ff", "#14b87a", t);
        }),
        borderWidth: 0,
        spacing: 2,
      }],
    },
    options: {
      circumference: 250,
      rotation: -125,
      cutout: "78%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      responsive: true, maintainAspectRatio: false,
    },
  });

  setText("winRateNum", `${win.toFixed(0)}%`);
  setText("totalTradesNum", r.total_trades);

  // Useful meta: profit factor + expectancy
  const pf  = r.profit_factor ? r.profit_factor.toFixed(2) : "—";
  const exp = r.expectancy != null ? "$" + Math.round(r.expectancy).toLocaleString() : "—";
  setText("winRateMeta", `PF ${pf} · Avg ${exp}/trade`);
}

function interpolateColor(c1, c2, t) {
  const h2r = h => h.match(/\w\w/g).map(x => parseInt(x, 16));
  const [r1, g1, b1] = h2r(c1.slice(1));
  const [r2, g2, b2] = h2r(c2.slice(1));
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/* ── Drawdown — Highstock underwater ─────────────────────────── */
function renderDrawdown() {
  const d    = STATE.data;
  const view = STATE.view;
  const ddStrat = view === "aligned" ? d.aligned.dd_strategy : d.strategy_full.dd;
  const ddGold  = view === "aligned" ? d.aligned.dd_gold     : null;

  destroyHC("dd");

  const series = [
    {
      name: "Strategy DD",
      type: "area",
      data: toHCData(ddStrat),
      color: COLOR.danger,
      lineWidth: 2,
      fillColor: {
        linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
        stops: [[0, "rgba(239,79,79,0.05)"], [1, "rgba(239,79,79,0.35)"]],
      },
    },
  ];
  if (ddGold) {
    series.push({
      name: "Gold Hold DD",
      type: "line",
      data: toHCData(ddGold),
      color: COLOR.gold,
      lineWidth: 1.8,
      dashStyle: "Dash",
    });
  }

  STATE.charts.dd = Highcharts.stockChart("chartDD", hcBase({
    title: null,
    yAxis: [{
      title: { text: "Drawdown %", style: { color: COLOR.text, fontSize: "11px" } },
      opposite: true,
      max: 0,
      labels: {
        style: { color: COLOR.text, fontSize: "11px" },
        formatter: function () { return this.value + "%"; },
      },
      gridLineColor: COLOR.grid,
      plotLines: [{ value: 0, color: COLOR.text, width: 1, dashStyle: "Dot" }],
    }],
    tooltip: { valueDecimals: 2, valueSuffix: "%" },
    series,
  }, "dd"));
}

/* ── Bootstrap Monte Carlo (real strategy returns) ─────────────
   Resamples each forward trade WITH REPLACEMENT from the 347 real
   trade returns recorded in the MT5 strategy report. This preserves
   the actual distribution — variance, skew, fat tails — instead of
   assuming a clean win/loss split with fixed R:R.
   Simulation result is cached — re-renders (theme toggle) redraw
   the chart without re-running 10 000 simulations. */
function renderMonteCarlo() {
  const tr = STATE.data.trade_returns;
  const r  = STATE.data.report;
  if (!tr || !tr.returns || tr.returns.length < 5) return;

  // Match the backtest horizon: ~5.79 yrs → ~70 months × ~5 trades/mo ≈ 350 trades/sim
  const params = {
    initial:        r.initial_deposit || 100000,
    tradesPerMonth: Math.max(1, Math.round(tr.trades_per_month || 5)),
    months:         Math.max(1, Math.round(tr.period_months   || 12)),
    nSims:          10000,
  };

  if (!STATE._mcCache) {
    const t0 = performance.now();
    STATE._mcCache = simulateBootstrapMC(tr.returns, params);
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`[MC] bootstrap ${params.nSims} sims × ${params.months}mo × ${params.tradesPerMonth}t from ${tr.returns.length} real trades = ${ms}ms`);
  }
  const result = STATE._mcCache;

  fillScenario("Best",  result.best,  params);
  fillScenario("Mid",   result.mid,   params);
  fillScenario("Worst", result.worst, params);
  drawMCChart(result, params);

  setText("mcSub",
    `${params.nSims.toLocaleString()} sims · ${params.months} months × ${params.tradesPerMonth} trades/mo · ` +
    `bootstrap from ${tr.n_trades} real trades · win ${tr.win_rate.toFixed(2)}% · avg win ${tr.avg_win_pct.toFixed(2)}% / loss ${tr.avg_loss_pct.toFixed(2)}% · best ${tr.best_trade_pct.toFixed(2)}% / worst ${tr.worst_trade_pct.toFixed(2)}%`);
}

/* Build a monthly-resolution real equity series (M+1 points) by
   sampling the strategy's balance curve evenly across its period. */
function buildActualMonthlyPath(months) {
  const curve = STATE.data.strategy_full?.balance;
  if (!curve || curve.length < 2) return null;
  const out = new Array(months + 1);
  for (let m = 0; m <= months; m++) {
    const idx = Math.min(curve.length - 1, Math.round((m / months) * (curve.length - 1)));
    out[m] = curve[idx].y;
  }
  return out;
}

/* ── Bootstrap core simulator ─────────────────────────────────── */
function simulateBootstrapMC(returns, p) {
  const M = p.months, T = p.tradesPerMonth, N = p.nSims;
  const R = returns.length;
  // Convert to a flat typed array for fast random access.
  const ret = new Float64Array(returns);

  const sims  = new Array(N);
  const paths = new Array(N);

  for (let s = 0; s < N; s++) {
    let bal = p.initial, peak = bal, maxDD = 0;
    let winStreak = 0, maxWinStreak = 0, winStreakSum = 0, winStreakCount = 0;
    let losStreak = 0, maxLosStreak = 0, losStreakSum = 0, losStreakCount = 0;
    let wins = 0, losses = 0, bes = 0;
    let gainSum = 0, lossSum = 0;

    const path = new Float32Array(M + 1);
    path[0] = bal;

    for (let m = 0; m < M; m++) {
      for (let t = 0; t < T; t++) {
        const r = ret[(Math.random() * R) | 0];
        const prev = bal;
        bal *= (1 + r);
        const delta = bal - prev;

        if (r > 0) {
          gainSum += delta;
          wins++;
          if (losStreak > 0) { losStreakSum += losStreak; losStreakCount++; losStreak = 0; }
          winStreak++;
          if (winStreak > maxWinStreak) maxWinStreak = winStreak;
        } else if (r < 0) {
          lossSum -= delta;            // delta is negative -> add absolute value
          losses++;
          if (winStreak > 0) { winStreakSum += winStreak; winStreakCount++; winStreak = 0; }
          losStreak++;
          if (losStreak > maxLosStreak) maxLosStreak = losStreak;
        } else {
          bes++;
          if (winStreak > 0) { winStreakSum += winStreak; winStreakCount++; winStreak = 0; }
          if (losStreak > 0) { losStreakSum += losStreak; losStreakCount++; losStreak = 0; }
        }

        if (bal > peak) peak = bal;
        const dd = (bal - peak) / peak;
        if (dd < maxDD) maxDD = dd;
      }
      path[m + 1] = bal;
    }

    // close out any open streak at the end of the sim
    if (winStreak > 0) { winStreakSum += winStreak; winStreakCount++; }
    if (losStreak > 0) { losStreakSum += losStreak; losStreakCount++; }

    const avgWinAmount = wins   ? gainSum / wins   : 0;
    const avgLossAmount = losses ? lossSum / losses : 0;

    sims[s] = {
      idx: s,
      final: bal,
      maxDD: maxDD * 100,
      maxWinStreak,
      maxLosStreak,
      avgWinStreak:  winStreakCount ? winStreakSum / winStreakCount : 0,
      avgLosStreak:  losStreakCount ? losStreakSum / losStreakCount : 0,
      winPct: ((wins / Math.max(1, wins + losses + bes)) * 100),
      avgRR: avgLossAmount > 0 ? avgWinAmount / avgLossAmount : 0,
      profitFactor: lossSum > 0 ? gainSum / lossSum : 0,
    };
    paths[s] = path;
  }

  // Sort by final
  const sorted = sims.slice().sort((a, b) => a.final - b.final);
  const pick   = pct => sorted[Math.min(N - 1, Math.max(0, Math.floor(N * pct / 100)))];
  const best   = pick(95);
  const mid    = pick(50);
  const worst  = pick(5);

  // Random spaghetti sample (~80 paths) — skip best/mid/worst so they stand out.
  const SPAG = 80;
  const skipIdx = new Set([best.idx, mid.idx, worst.idx]);
  const spaghetti = [];
  while (spaghetti.length < SPAG && spaghetti.length < N - 3) {
    const r = Math.floor(Math.random() * N);
    if (skipIdx.has(r)) continue;
    skipIdx.add(r);
    spaghetti.push(Array.from(paths[r]));
  }

  return {
    best, mid, worst,
    bestPath:  Array.from(paths[best.idx]),
    midPath:   Array.from(paths[mid.idx]),
    worstPath: Array.from(paths[worst.idx]),
    spaghetti,
    months: M,
  };
}

/* ── Scenario card filler ─────────────────────────────────────── */
function fillScenario(name, s, p) {
  const retPct = (s.final - p.initial) / p.initial * 100;
  setText(`mc${name}Final`,     "$" + Math.round(s.final).toLocaleString());
  const retStr = (retPct >= 0 ? "+" : "") + retPct.toFixed(2) + "%";
  setText(`mc${name}Ret`,       retStr + "  over " + p.months + " months");
  setText(`mc${name}DD`,        s.maxDD.toFixed(2) + "%");
  setText(`mc${name}Wins`,      s.maxWinStreak);
  setText(`mc${name}Losses`,    s.maxLosStreak);
  setText(`mc${name}AvgWins`,   s.avgWinStreak.toFixed(2));
  setText(`mc${name}AvgLosses`, s.avgLosStreak.toFixed(2));
  setText(`mc${name}WinPct`,    s.winPct.toFixed(2) + "%");
  setText(`mc${name}RR`,        s.avgRR.toFixed(2) + " : 1");
  setText(`mc${name}PF`,        s.profitFactor.toFixed(2));
}

/* ── Spaghetti chart ─────────────────────────────────────────── */
function drawMCChart(result, p) {
  const xs   = Array.from({ length: result.months + 1 }, (_, i) => i);
  const toXY = (arr) => arr.map((y, i) => [xs[i], y]);

  // Palette for spaghetti — mixed muted hues, cycled
  const palette = [
    "#3565ff", "#14b87a", "#f2b43a", "#ef4f4f",
    "#6e54ff", "#19c2c2", "#ff7a3a", "#c83cb7",
  ];

  // Build series array
  const series = [];

  // Many faded spaghetti paths first (so they sit BEHIND the featured lines)
  result.spaghetti.forEach((path, i) => {
    const col = palette[i % palette.length];
    series.push({
      name: "sim " + i,
      type: "line",
      data: toXY(path),
      color: Highcharts.color(col).setOpacity(0.18).get(),
      lineWidth: 1,
      enableMouseTracking: false,
      animation: false,
      showInLegend: false,
      marker: { enabled: false },
      states: { hover: { enabled: false }, inactive: { opacity: 1 } },
      shadow: false,
      zIndex: 1,
    });
  });

  // Pill-style end-of-line dataLabel — only on the last point
  const endLabel = (bg) => ({
    enabled: true,
    align: "left",
    verticalAlign: "middle",
    x: 6, y: 0,
    backgroundColor: bg,
    borderRadius: 4,
    padding: 4,
    style: { color: "#fff", fontWeight: 800, fontSize: "11px", textOutline: "none" },
    formatter: function () {
      const last = this.series.xData[this.series.xData.length - 1];
      if (this.point.x !== last) return null;
      return "$" + Math.round(this.y).toLocaleString();
    },
    overflow: "allow",
    crop: false,
  });

  // Three featured paths on top, with bold colors and end-of-line pill
  series.push({
    name: "★ Best (95th)",  type: "line",
    data: toXY(result.bestPath),
    color: "#14b87a", lineWidth: 2.4, zIndex: 5,
    marker: { enabled: false }, animation: false,
    dataLabels: endLabel("#14b87a"),
  });
  series.push({
    name: "● Median (50th)", type: "line",
    data: toXY(result.midPath),
    color: "#3565ff", lineWidth: 2.4, zIndex: 5,
    marker: { enabled: false }, animation: false,
    dataLabels: endLabel("#3565ff"),
  });
  series.push({
    name: "▼ Worst (5th)",   type: "line",
    data: toXY(result.worstPath),
    color: "#ef4f4f", lineWidth: 2.4, zIndex: 5,
    marker: { enabled: false }, animation: false,
    dataLabels: endLabel("#ef4f4f"),
  });

  // Overlay the ACTUAL realized backtest equity curve (resampled monthly)
  // so the user can see where the real path falls inside the simulated cone.
  const actualPath = buildActualMonthlyPath(result.months);
  if (actualPath) {
    series.push({
      name: "◆ Actual backtest", type: "line",
      data: toXY(actualPath),
      color: "#f2b43a", lineWidth: 2.6, zIndex: 6,
      dashStyle: "ShortDash",
      marker: { enabled: false }, animation: false,
      dataLabels: endLabel("#f2b43a"),
    });
  }

  destroyHC("mc");
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  STATE.charts.mc = Highcharts.chart("chartMC", {
    chart: {
      backgroundColor: dark ? "#161a23" : "#ffffff",
      style: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" },
      animation: { duration: 350 },
      spacing: [10, 80, 10, 6],   // right padding gives pills room
      zooming: { type: "" },      // no drag-to-zoom
      panning: { enabled: false },// no pan
    },
    credits: { enabled: false },
    legend:  { enabled: false },
    title:   { text: null },
    xAxis: {
      type: "linear",
      min: 0,
      max: result.months,
      title: { text: "Month", style: { color: COLOR.text, fontSize: "11px" } },
      labels: { style: { color: COLOR.text, fontSize: "11px" } },
      lineColor: COLOR.grid,
      tickColor: COLOR.grid,
      crosshair: { color: "rgba(53,101,255,0.35)", dashStyle: "ShortDot", width: 1 },
    },
    yAxis: [{
      title: { text: "Equity ($)", style: { color: COLOR.text, fontSize: "11px" } },
      opposite: false,
      labels: {
        style: { color: COLOR.text, fontSize: "11px" },
        formatter: function () {
          return this.value >= 1000
            ? "$" + Math.round(this.value / 1000) + "k"
            : "$" + Math.round(this.value);
        },
      },
      gridLineColor: COLOR.grid,
      plotLines: [{
        value: p.initial, color: COLOR.text, width: 1, dashStyle: "Dot",
        label: { text: "$" + p.initial.toLocaleString(),
                 style: { color: COLOR.text, fontSize: "10px" }, align: "left", x: 4 },
      }],
    }],
    tooltip: {
      shared: false,
      backgroundColor: "rgba(20,30,60,0.95)", borderColor: "transparent",
      style: { color: "#fff", fontSize: "12px" },
      formatter: function () {
        return `<div style="font-weight:600;margin-bottom:2px">${this.series.name}</div>` +
               `<div>Month ${this.x}: <b>$${Math.round(this.y).toLocaleString()}</b></div>`;
      },
    },
    series,
    plotOptions: {
      series: { animation: false, marker: { enabled: false } },
    },
  });
}

/* ── Trade stats ────────────────────────────────────────────── */
function renderTradeStats() {
  const r = STATE.data.report;
  const rows = [
    ["Net Profit",      fmtMoney(r.net_profit),       "up"],
    ["Gross Profit",    fmtMoney(r.gross_profit),     "up"],
    ["Gross Loss",      fmtMoney(r.gross_loss),       "down"],
    ["Profit Factor",   fmtNum(r.profit_factor, 2),   ""],
    ["Expected Payoff", fmtMoney(r.expected_payoff),  ""],
    ["Recovery Factor", fmtNum(r.recovery_factor, 2), ""],
    ["Sharpe (MT5)",    fmtNum(r.sharpe_ratio, 2),    ""],
    ["Total Trades",    r.total_trades,               ""],
    ["Win Rate",        fmtPctRaw(r.win_rate),        ""],
    ["Avg Win",         fmtMoney(r.avg_win),          "up"],
    ["Avg Loss",        fmtMoney(r.avg_loss),         "down"],
    ["Avg R:R",         fmtNum(r.avg_rr, 2) + " : 1", ""],
    ["Expectancy / trade", fmtMoney(r.expectancy),    r.expectancy > 0 ? "up" : "down"],
    ["Largest Win",     fmtMoney(r.largest_win),      "up"],
    ["Largest Loss",    fmtMoney(r.largest_loss),     "down"],
  ];
  document.getElementById("tradeStats").innerHTML = rows.map(([k, v, cls]) =>
    `<li><span class="label">${k}</span><span class="val ${cls}">${v}</span></li>`).join("");
}

/* ── Monthly returns heatmap ────────────────────────────────── */
function renderHeatmap() {
  const data = STATE.data.monthly_returns;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = Object.keys(data).sort();

  let maxAbs = 0;
  years.forEach(y => Object.values(data[y]).forEach(v => maxAbs = Math.max(maxAbs, Math.abs(v))));
  if (maxAbs === 0) maxAbs = 1;

  const colorFor = v => {
    const t = Math.min(Math.abs(v) / maxAbs, 1);
    const a = (0.10 + 0.65 * t).toFixed(2);
    return v >= 0 ? `rgba(20,184,122,${a})` : `rgba(239,79,79,${a})`;
  };

  let html = `<div class="hm-row"><div></div>` +
    months.map(m => `<div class="hm-head">${m}</div>`).join("") +
    `<div class="hm-head">YTD</div></div>`;

  years.forEach(y => {
    const row = data[y] || {};
    let ytd = 1, any = false;
    for (let mo = 1; mo <= 12; mo++) {
      const v = row[mo] ?? row[String(mo)];
      if (v != null) { ytd *= 1 + v / 100; any = true; }
    }
    ytd = (ytd - 1) * 100;

    html += `<div class="hm-row"><div class="hm-year">${y}</div>`;
    for (let mo = 1; mo <= 12; mo++) {
      const v = row[mo] ?? row[String(mo)];
      if (v == null) {
        html += `<div class="hm-cell muted">—</div>`;
      } else {
        const c = colorFor(v);
        const txt = v >= 0 ? "#0a7a4f" : "#a32525";
        html += `<div class="hm-cell" style="background:${c}; color:${txt};" title="${y}-${String(mo).padStart(2,"0")}: ${v.toFixed(2)}%">${v.toFixed(1)}</div>`;
      }
    }
    html += `<div class="hm-total" title="YTD ${ytd.toFixed(2)}%">${any ? ytd.toFixed(1) + "%" : "—"}</div></div>`;
  });

  document.getElementById("heatmap").innerHTML = html;
}

/* ── Chart helpers (NO date-fns adapter; category x with smart tick formatter) ── */
function dateLineOpts({ yLabel = "" } = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(20,30,60,0.95)",
        padding: 10, cornerRadius: 8,
        titleFont: { size: 12, weight: "600" },
        bodyFont:  { size: 12 },
        callbacks: {
          title: items => items[0].label,
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : Number(ctx.parsed.y).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: {
        type: "category",
        grid: { display: false },
        ticks: {
          color: COLOR.text, font: { size: 11 },
          autoSkip: true, maxTicksLimit: 8, maxRotation: 0,
          callback: function (_v, idx) {
            const lbl = this.getLabelForValue(idx);
            if (!lbl) return "";
            const [y, m] = String(lbl).split("-");
            const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m,10)-1] || m;
            return `${mn} ${String(y).slice(2)}`;
          },
        },
      },
      y: {
        position: "right",
        grid: { color: COLOR.grid },
        ticks: { color: COLOR.text, font: { size: 11 }, callback: v => Number(v).toFixed(0) },
        title: yLabel ? { display: true, text: yLabel, color: COLOR.text, font: { size: 11 } } : undefined,
      },
    },
  };
}

function destroyChart(name) {
  if (STATE.charts[name]) { STATE.charts[name].destroy(); STATE.charts[name] = null; }
}

/* ── Lenis (smooth scroll) + GSAP (reveals & count-up) ────────── */
function setupSmoothMotion() {
  // Note: we intentionally do NOT honor prefers-reduced-motion here — Lenis +
  // GSAP are part of the explicit dashboard design. Disable in code if needed.
  if (typeof Lenis === "undefined") {
    console.warn("[motion] Lenis global is undefined — CDN may have failed");
    return;
  }
  if (typeof gsap === "undefined") {
    console.warn("[motion] gsap global is undefined — CDN may have failed");
    return;
  }
  if (typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

  // 1. Lenis — buttery wheel/touch scroll
  let lenis;
  try {
    lenis = new Lenis({
      // ── Scroll-feel knobs ─────────────────────────────────────
      //  duration         : seconds to settle per wheel event. ↓ = faster, ↑ = smoother/longer glide.
      //  wheelMultiplier  : how far each wheel tick scrolls. ↑ = bigger jumps per tick.
      //  Try: snappy ≈ 0.6, balanced ≈ 0.9, cinematic ≈ 1.5
      duration: 0.9,
      wheelMultiplier: 1.1,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),   // out-expo
      smoothWheel: true,
      syncTouch: false,
      touchMultiplier: 1.5,
    });
    STATE.lenis = lenis;
    console.log("[motion] Lenis active — duration 1.5s, out-expo");
  } catch (err) {
    console.error("[motion] Lenis init failed:", err);
    return;
  }

  // Drive Lenis via GSAP's ticker so animations & scroll stay in lockstep
  if (typeof ScrollTrigger !== "undefined") {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  // 2. Above-the-fold KPI cards: immediate cascade (no ScrollTrigger needed)
  //    These are visible on page load; we just stagger them in.
  gsap.from(".kpi-grid .kpi-card", {
    opacity: 0,
    y: 50,
    scale: 0.94,
    duration: 0.85,
    ease: "power3.out",
    stagger: 0.12,
    clearProps: "scale",
  });

  // 3. Below-the-fold sections: ScrollTrigger reveals
  //    immediateRender: false → element stays visible until trigger; when it
  //    fires, GSAP snaps to FROM then animates to natural state. With Lenis
  //    routing scroll events to ScrollTrigger.update, this works reliably.
  if (typeof ScrollTrigger !== "undefined") {
    gsap.utils.toArray(".row .card").forEach(el => {
      gsap.from(el, {
        opacity: 0,
        y: 70,
        scale: 0.97,
        duration: 1.0,
        ease: "power3.out",
        immediateRender: false,
        clearProps: "scale",
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      });
    });

    console.log("[motion] GSAP reveals attached: " +
      document.querySelectorAll(".row .card").length + " row cards");

    // Lenis drives scroll updates; force one refresh so above-fold cards register.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  // 3. KPI value count-up (runs once after numbers are in the DOM)
  setupKPICountUp();
}

/** Animate each KPI value from 0 to its final number on first reveal. */
function setupKPICountUp() {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  const animate = (el) => {
    if (el.dataset.countDone === "1") return;
    const raw  = el.textContent.trim();
    const num  = parseFloat(raw.replace(/[^\d.\-]/g, ""));
    if (!isFinite(num)) return;
    el.dataset.countDone = "1";

    // Preserve sign and unit suffix (%, ×, etc.)
    const isPct  = raw.includes("%");
    const isMult = raw.includes("×");
    const decimals = (raw.match(/\.(\d+)/)?.[1] || "").length || 2;
    const sign     = raw.trim().startsWith("-") || num < 0 ? "" : (raw.startsWith("+") ? "+" : "");

    const obj = { v: 0 };
    gsap.to(obj, {
      v: num,
      duration: 1.1,
      ease: "power2.out",
      onUpdate: () => {
        const v = obj.v;
        let txt = sign + v.toFixed(decimals);
        if (isPct)  txt += "%";
        if (isMult) txt += "×";
        el.textContent = txt;
      },
    });
  };

  document.querySelectorAll(".kpi-value").forEach(el => {
    ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      once: true,
      onEnter: () => animate(el),
    });
  });
}

/* ── Go ───────────────────────────────────────────────────────── */
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
