(() => {
  "use strict";

  const STATES = [
    { key: "baseline", label: "Baseline", color: "--series-baseline" },
    { key: "corrupted", label: "Corrupted", color: "--series-corrupted" },
    { key: "repaired", label: "Repaired", color: "--series-repaired" },
  ];

  const REAL_PATHS = {
    metrics: {
      baseline: "../data/results/baseline_metrics.json",
      corrupted: "../data/results/corrupted_metrics.json",
      repaired: "../data/results/repaired_metrics.json",
    },
    quality: {
      baseline: "../data/quality/baseline.json",
      corrupted: "../data/quality/corrupted.json",
      repaired: "../data/quality/repaired.json",
    },
    freshness: {
      baseline: "../data/quality/freshness_report.json",
      corrupted: "../data/quality/freshness_report_corrupted.json",
      repaired: "../data/quality/freshness_report_repaired.json",
    },
  };

  const MOCK = {
    metrics: {
      baseline: { samples: 20, retrieval_hit_rate: 0.83, mean_token_f1: 0.61, judge_accuracy: 0.79, mean_judge_score: 4.2 },
      corrupted: { samples: 20, retrieval_hit_rate: 0.42, mean_token_f1: 0.31, judge_accuracy: 0.38, mean_judge_score: 2.4 },
      repaired: { samples: 20, retrieval_hit_rate: 0.8, mean_token_f1: 0.58, judge_accuracy: 0.76, mean_judge_score: 4.0 },
    },
    quality: {
      baseline: {
        report_name: "baseline",
        row_count: 24,
        passed: true,
        checks: [
          { name: "row_count", dimension: "completeness", passed: true, detail: { row_count: 24 } },
          { name: "paper_id_not_null_unique", dimension: "uniqueness", passed: true, detail: { missing: 0, duplicates: 0 } },
          { name: "title_not_null", dimension: "completeness", passed: true, detail: { missing: 0 } },
          { name: "summary_length", dimension: "validity", passed: true, detail: { below_min_chars: 0 } },
          { name: "freshness", dimension: "freshness", passed: true, detail: { stale_rows: 0 } },
        ],
      },
      corrupted: {
        report_name: "corrupted",
        row_count: 24,
        passed: false,
        checks: [
          { name: "row_count", dimension: "completeness", passed: true, detail: { row_count: 24 } },
          { name: "paper_id_not_null_unique", dimension: "uniqueness", passed: false, detail: { missing: 0, duplicates: 3 } },
          { name: "title_not_null", dimension: "completeness", passed: false, detail: { missing: 2 } },
          { name: "summary_length", dimension: "validity", passed: false, detail: { below_min_chars: 5 } },
          { name: "freshness", dimension: "freshness", passed: false, detail: { stale_rows: 6 } },
        ],
      },
      repaired: {
        report_name: "repaired",
        row_count: 24,
        passed: true,
        checks: [
          { name: "row_count", dimension: "completeness", passed: true, detail: { row_count: 24 } },
          { name: "paper_id_not_null_unique", dimension: "uniqueness", passed: true, detail: { missing: 0, duplicates: 0 } },
          { name: "title_not_null", dimension: "completeness", passed: true, detail: { missing: 0 } },
          { name: "summary_length", dimension: "validity", passed: true, detail: { below_min_chars: 0 } },
          { name: "freshness", dimension: "freshness", passed: true, detail: { stale_rows: 0 } },
        ],
      },
    },
    freshness: {
      baseline: { latest_published: "2026-05-01", oldest_published: "2025-03-01", stale_rows: 0, total_rows: 24, is_fresh: true, freshness_threshold_days: 180 },
      corrupted: { latest_published: "2023-01-15", oldest_published: "2025-03-01", stale_rows: 6, total_rows: 24, is_fresh: false, freshness_threshold_days: 180 },
      repaired: { latest_published: "2026-05-01", oldest_published: "2025-03-01", stale_rows: 0, total_rows: 24, is_fresh: true, freshness_threshold_days: 180 },
    },
  };

  function seriesColor(stateKey) {
    const state = STATES.find((s) => s.key === stateKey);
    return getComputedStyle(document.documentElement).getPropertyValue(state.color).trim();
  }

  // ---------- theme ----------
  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    const stored = localStorage.getItem("dash-theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    const syncLabel = () => {
      const current = document.documentElement.getAttribute("data-theme");
      const isDark = current === "dark" || (!current && matchMedia("(prefers-color-scheme: dark)").matches);
      btn.textContent = isDark ? "Light mode" : "Dark mode";
    };
    syncLabel();
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const isDark = current === "dark" || (!current && matchMedia("(prefers-color-scheme: dark)").matches);
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("dash-theme", next);
      syncLabel();
      renderAll(window.__dashboardData);
    });
  }

  // ---------- data loading ----------
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }

  async function loadRealBundle() {
    const entries = [];
    for (const group of Object.keys(REAL_PATHS)) {
      for (const stateKey of Object.keys(REAL_PATHS[group])) {
        entries.push([group, stateKey, REAL_PATHS[group][stateKey]]);
      }
    }
    const results = await Promise.all(entries.map(([, , path]) => fetchJson(path)));
    const bundle = { metrics: {}, quality: {}, freshness: {} };
    entries.forEach(([group, stateKey], i) => {
      bundle[group][stateKey] = results[i];
    });
    return bundle;
  }

  async function loadData() {
    try {
      const real = await loadRealBundle();
      return { ...real, isMock: false };
    } catch (err) {
      return { ...MOCK, isMock: true };
    }
  }

  // ---------- banner ----------
  function renderBanner(isMock) {
    const el = document.getElementById("banner");
    el.className = `banner ${isMock ? "mock" : "live"}`;
    el.innerHTML = "";
    const dot = document.createElement("span");
    dot.className = "dot";
    const text = document.createElement("span");
    text.textContent = isMock
      ? "Demo data (mock) — chưa tìm thấy artifact thật trong data/results, data/quality. Chạy baseline + corruption flow rồi mở lại để xem số liệu thật."
      : "Live data — artifact đọc trực tiếp từ data/results và data/quality.";
    el.append(dot, text);
  }

  // ---------- svg bar chart helpers ----------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  }

  function roundedTopPath(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height));
    if (height <= 0) return `M${x},${y} L${x},${y} L${x + width},${y} L${x + width},${y} Z`;
    return [
      `M${x},${y + height}`,
      `L${x},${y + r}`,
      `Q${x},${y} ${x + r},${y}`,
      `L${x + width - r},${y}`,
      `Q${x + width},${y} ${x + width},${y + r}`,
      `L${x + width},${y + height}`,
      "Z",
    ].join(" ");
  }

  const tooltipEl = document.getElementById("tooltip");

  function showTooltip(x, y, seriesLabel, categoryLabel, valueText) {
    tooltipEl.innerHTML = "";
    const value = document.createElement("div");
    value.className = "tt-value";
    value.textContent = valueText;
    const meta = document.createElement("div");
    meta.className = "tt-series";
    meta.textContent = `${seriesLabel} · ${categoryLabel}`;
    tooltipEl.append(value, meta);
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y - 10}px`;
    tooltipEl.classList.add("visible");
  }

  function hideTooltip() {
    tooltipEl.classList.remove("visible");
  }

  function attachBarTooltip(rect, seriesLabel, categoryLabel, valueText) {
    rect.setAttribute("tabindex", "0");
    rect.setAttribute("role", "img");
    rect.setAttribute("aria-label", `${seriesLabel}, ${categoryLabel}: ${valueText}`);
    const onMove = (e) => {
      const clientX = e.clientX ?? rect.getBoundingClientRect().x;
      const clientY = e.clientY ?? rect.getBoundingClientRect().y;
      showTooltip(clientX, clientY, seriesLabel, categoryLabel, valueText);
    };
    const onFocus = () => {
      const box = rect.getBoundingClientRect();
      showTooltip(box.x + box.width / 2, box.y, seriesLabel, categoryLabel, valueText);
    };
    rect.addEventListener("pointerenter", onMove);
    rect.addEventListener("pointermove", onMove);
    rect.addEventListener("pointerleave", hideTooltip);
    rect.addEventListener("focus", onFocus);
    rect.addEventListener("blur", hideTooltip);
  }

  function renderLegend(container, items) {
    const legend = document.createElement("div");
    legend.className = "legend";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = item.color;
      const label = document.createElement("span");
      label.textContent = item.label;
      row.append(swatch, label);
      legend.appendChild(row);
    });
    container.appendChild(legend);
  }

  function renderGroupedBarChart(container, { categories, series, yMax, yTicks, formatValue, labelBars }) {
    container.innerHTML = "";
    renderLegend(
      container,
      series.map((s) => ({ label: s.label, color: s.color }))
    );

    const width = Math.max(container.clientWidth || 560, 480);
    const height = 260;
    const margin = { top: 16, right: 16, bottom: 30, left: 40 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const svg = el("svg", { class: "chart", width, height, viewBox: `0 0 ${width} ${height}` });
    const plot = el("g", { transform: `translate(${margin.left},${margin.top})` });
    svg.appendChild(plot);

    // gridlines + y ticks
    yTicks.forEach((tick) => {
      const yPos = plotH - (tick / yMax) * plotH;
      plot.appendChild(el("line", { x1: 0, x2: plotW, y1: yPos, y2: yPos, stroke: "var(--gridline)", "stroke-width": 1 }));
      const label = el("text", { x: -8, y: yPos + 3, class: "chart-tick", "text-anchor": "end" });
      label.textContent = formatValue(tick);
      plot.appendChild(label);
    });
    plot.appendChild(el("line", { x1: 0, x2: plotW, y1: plotH, y2: plotH, stroke: "var(--baseline-axis)", "stroke-width": 1 }));

    const groupWidth = plotW / categories.length;
    const barWidth = Math.min(24, (groupWidth - 16) / series.length);
    const barGap = 2;

    categories.forEach((cat, ci) => {
      const groupX = ci * groupWidth;
      const totalBarsWidth = series.length * barWidth + (series.length - 1) * barGap;
      const startX = groupX + (groupWidth - totalBarsWidth) / 2;

      series.forEach((s, si) => {
        const value = s.values[cat.key] ?? 0;
        const barHeight = (value / yMax) * plotH;
        const x = startX + si * (barWidth + barGap);
        const y = plotH - barHeight;
        const path = el("path", {
          d: roundedTopPath(x, y, barWidth, barHeight, 4),
          fill: s.color,
          class: "bar-rect",
        });
        attachBarTooltip(path, s.label, cat.label, formatValue(value));
        plot.appendChild(path);

        if (labelBars) {
          const label = el("text", { x: x + barWidth / 2, y: y - 6, class: "chart-value-label", "text-anchor": "middle" });
          label.textContent = formatValue(value);
          plot.appendChild(label);
        }
      });

      const catLabel = el("text", { x: groupX + groupWidth / 2, y: plotH + 18, class: "chart-category-label", "text-anchor": "middle" });
      catLabel.textContent = cat.label;
      plot.appendChild(catLabel);
    });

    container.appendChild(svg);
  }

  function renderDataTable(container, { categories, series, formatValue }) {
    container.innerHTML = "";
    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th")).textContent = "Metric";
    series.forEach((s) => {
      const th = document.createElement("th");
      th.textContent = s.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    categories.forEach((cat) => {
      const row = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = cat.label;
      row.appendChild(th);
      series.forEach((s) => {
        const td = document.createElement("td");
        td.className = "num";
        td.textContent = formatValue(s.values[cat.key] ?? 0);
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // ---------- quality / freshness cards ----------
  function statusBadge(passed, passLabel = "PASS", failLabel = "FAIL") {
    const badge = document.createElement("span");
    badge.className = `status-badge ${passed ? "pass" : "fail"}`;
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.style.background = passed ? "var(--status-good)" : "var(--status-critical)";
    badge.appendChild(dot);
    const label = document.createElement("span");
    label.textContent = passed ? passLabel : failLabel;
    badge.appendChild(label);
    return badge;
  }

  function renderQualityGrid(quality) {
    const grid = document.getElementById("quality-grid");
    grid.innerHTML = "";
    STATES.forEach((state) => {
      const report = quality[state.key];
      const card = document.createElement("div");
      card.className = "state-card";

      const header = document.createElement("div");
      header.className = "state-card-header";
      const title = document.createElement("h3");
      const swatch = document.createElement("span");
      swatch.className = "state-swatch";
      swatch.style.background = `var(${state.color})`;
      title.append(swatch, document.createTextNode(state.label));
      header.appendChild(title);
      header.appendChild(statusBadge(!!report?.passed));
      card.appendChild(header);

      const list = document.createElement("ul");
      list.className = "check-list";
      (report?.checks || []).forEach((check) => {
        const li = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "check-dot";
        dot.style.background = check.passed ? "var(--status-good)" : "var(--status-critical)";
        const text = document.createElement("span");
        text.textContent = `${check.name} (${check.dimension}): ${check.passed ? "pass" : "fail"}`;
        li.append(dot, text);
        list.appendChild(li);
      });
      card.appendChild(list);
      grid.appendChild(card);
    });
  }

  function renderFreshnessGrid(freshness) {
    const grid = document.getElementById("freshness-grid");
    grid.innerHTML = "";
    STATES.forEach((state) => {
      const report = freshness[state.key];
      const card = document.createElement("div");
      card.className = "state-card";

      const header = document.createElement("div");
      header.className = "state-card-header";
      const title = document.createElement("h3");
      const swatch = document.createElement("span");
      swatch.className = "state-swatch";
      swatch.style.background = `var(${state.color})`;
      title.append(swatch, document.createTextNode(state.label));
      header.appendChild(title);
      header.appendChild(statusBadge(!!report?.is_fresh, "FRESH", "STALE"));
      card.appendChild(header);

      const stats = document.createElement("div");
      stats.className = "stat-row";
      const rows = [
        ["Latest published", report?.latest_published ?? "n/a"],
        ["Oldest published", report?.oldest_published ?? "n/a"],
        ["Stale / total rows", `${report?.stale_rows ?? "n/a"} / ${report?.total_rows ?? "n/a"}`],
        ["Threshold (days)", report?.freshness_threshold_days ?? "n/a"],
      ];
      rows.forEach(([label, value]) => {
        const l = document.createElement("span");
        l.className = "stat-label";
        l.textContent = label;
        const v = document.createElement("span");
        v.className = "stat-value";
        v.textContent = value;
        stats.append(l, v);
      });
      card.appendChild(stats);
      grid.appendChild(card);
    });
  }

  // ---------- top-level render ----------
  function renderAll(data) {
    if (!data) return;
    renderBanner(data.isMock);

    const fractionalCategories = [
      { key: "retrieval_hit_rate", label: "retrieval_hit_rate" },
      { key: "mean_token_f1", label: "mean_token_f1" },
      { key: "judge_accuracy", label: "judge_accuracy" },
    ];
    const fractionalSeries = STATES.map((s) => ({
      key: s.key,
      label: s.label,
      color: seriesColor(s.key),
      values: {
        retrieval_hit_rate: data.metrics[s.key]?.retrieval_hit_rate,
        mean_token_f1: data.metrics[s.key]?.mean_token_f1,
        judge_accuracy: data.metrics[s.key]?.judge_accuracy,
      },
    }));
    const fmtFraction = (v) => v.toFixed(2);

    renderGroupedBarChart(document.getElementById("chart-fractional"), {
      categories: fractionalCategories,
      series: fractionalSeries,
      yMax: 1,
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      formatValue: fmtFraction,
      labelBars: false,
    });
    renderDataTable(document.getElementById("table-fractional"), {
      categories: fractionalCategories,
      series: fractionalSeries,
      formatValue: fmtFraction,
    });

    const judgeCategories = [{ key: "state", label: "Mean judge score" }];
    const judgeSeries = STATES.map((s) => ({
      key: s.key,
      label: s.label,
      color: seriesColor(s.key),
      values: { state: data.metrics[s.key]?.mean_judge_score ?? 0 },
    }));
    const fmtJudge = (v) => v.toFixed(1);

    renderGroupedBarChart(document.getElementById("chart-judge"), {
      categories: judgeCategories,
      series: judgeSeries,
      yMax: 5,
      yTicks: [0, 1, 2, 3, 4, 5],
      formatValue: fmtJudge,
      labelBars: true,
    });
    renderDataTable(document.getElementById("table-judge"), {
      categories: judgeCategories,
      series: judgeSeries,
      formatValue: fmtJudge,
    });

    renderQualityGrid(data.quality);
    renderFreshnessGrid(data.freshness);
  }

  window.addEventListener("resize", () => renderAll(window.__dashboardData));

  // ---------- per-dimension error checker ----------
  // Mỗi box mirror một check trong src/observability/quality.py / build_freshness_report,
  // chạy độc lập trên bối cảnh (record + row_count/duplicate_count) người dùng nhập.
  const RECORD_MIN_SUMMARY_CHARS = 20; // src/observability/quality.py MIN_SUMMARY_CHARS
  const RECORD_FRESHNESS_THRESHOLD_DAYS = 180; // src/core/config.py load_settings() default

  const SAMPLE_GOOD = {
    paper_id: "10.1000/agentic-rag-2026",
    title: "Agentic Retrieval-Augmented Generation for Scientific Literature",
    summary:
      "We propose an agentic RAG pipeline that combines semantic retrieval over a curated corpus with tool-augmented reasoning to answer multi-hop scientific questions.",
    published: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 45);
      return d.toISOString().slice(0, 10);
    })(),
    row_count: 24,
    duplicate_count: 1,
  };

  const SAMPLE_BAD = {
    paper_id: "",
    title: "",
    summary: "n/a",
    published: "2019-01-01",
    row_count: 0,
    duplicate_count: 3,
  };

  function daysBetween(from, to) {
    return Math.floor((to.getTime() - from.getTime()) / 86400000);
  }

  function formatReceivedAt(date) {
    const iso = date.toISOString();
    const local = date.toLocaleString("vi-VN", { hour12: false });
    return `${local} (local) · ${iso} (UTC)`;
  }

  const DIMENSIONS = [
    {
      key: "volume",
      label: "Volume",
      problem:
        "Thiếu bản ghi — Crossref trả về ít record hơn kỳ vọng, hoặc cả batch fetch bị rỗng (lỗi mạng, sai source_query/source_filter, rate limit 429/503 không retry được).",
      remedy:
        "run_data_quality_checks chặn ngay ở check row_count: row_count = 0 thì pipeline nên dừng, không build index trên dataset rỗng — cần kiểm tra lại query/filter rồi fetch lại.",
      run(ctx) {
        const passed = ctx.rowCount > 0;
        return {
          passed,
          explanation: passed
            ? `row_count = ${ctx.rowCount} — batch có dữ liệu, pipeline chạy tiếp bình thường.`
            : `row_count = ${ctx.rowCount} — batch rỗng, đây là lỗi Volume nghiêm trọng nhất: không có gì để clean/embed/evaluate.`,
        };
      },
    },
    {
      key: "completeness",
      label: "Completeness",
      problem:
        "Bản ghi thiếu trường bắt buộc — paper_id hoặc title rỗng, thường do Crossref trả record thiếu metadata hoặc parse payload sai.",
      remedy:
        "Check paper_id_not_null / title_not_null loại record khỏi cleaned dataset ngay khi thiếu — build_clean_dataframe không cố suy đoán giá trị thay thế.",
      run(ctx) {
        const missing = [];
        if (!ctx.paperId) missing.push("paper_id");
        if (!ctx.title) missing.push("title");
        const passed = missing.length === 0;
        return {
          passed,
          explanation: passed
            ? "paper_id và title đều có giá trị — record đủ điều kiện completeness."
            : `Thiếu trường: ${missing.join(", ")} — record này sẽ bị loại khỏi cleaned dataset, không dùng để build embedding.`,
        };
      },
    },
    {
      key: "uniqueness",
      label: "Uniqueness",
      problem:
        "Duplicate rows — cùng paper_id xuất hiện nhiều lần trong batch (corruption cố ý add duplicate, hoặc lỗi ingest gọi API 2 lần).",
      remedy:
        "paper_id_not_null_unique đếm duplicated() trên toàn dataset; cần dedupe theo paper_id trước khi rebuild index, nếu không retrieval sẽ bị lệch trọng số về phía record lặp.",
      run(ctx) {
        const passed = ctx.dupCount <= 1;
        return {
          passed,
          explanation: passed
            ? `paper_id "${ctx.paperId || "(rỗng)"}" xuất hiện ${ctx.dupCount} lần trong batch — không trùng.`
            : `paper_id "${ctx.paperId || "(rỗng)"}" xuất hiện ${ctx.dupCount} lần trong batch — duplicate, cần dedupe trước khi build index.`,
        };
      },
    },
    {
      key: "validity",
      label: "Validity",
      problem:
        "Summary rỗng hoặc bị noise hóa (ký tự rác), published sai định dạng — dữ liệu tồn tại nhưng nội dung không dùng được.",
      remedy:
        "summary_length check độ dài tối thiểu; record dưới ngưỡng vẫn còn trong dataset nhưng bị đánh dấu fail — cần review thủ công hoặc regenerate summary từ raw source.",
      run(ctx) {
        const summaryOk = ctx.summary.length >= RECORD_MIN_SUMMARY_CHARS;
        const passed = summaryOk && ctx.publishedValid;
        const issues = [];
        if (!summaryOk) issues.push(`summary chỉ ${ctx.summary.length} ký tự (cần ≥ ${RECORD_MIN_SUMMARY_CHARS})`);
        if (!ctx.publishedValid) issues.push(`published "${ctx.publishedRaw || "(rỗng)"}" không parse được`);
        return {
          passed,
          explanation: passed
            ? `summary dài ${ctx.summary.length} ký tự và published hợp lệ — record đạt validity.`
            : `Vấn đề: ${issues.join("; ")} — retrieval dựa trên record này sẽ kém tin cậy hoặc freshness không tính được.`,
        };
      },
    },
    {
      key: "freshness",
      label: "Freshness",
      problem:
        "published quá cũ so với ngưỡng (mặc định 180 ngày) — agent trả lời dựa trên thông tin lỗi thời dù retrieval vẫn hit đúng record.",
      remedy:
        "build_freshness_report tính age_days từ published; stale_rows > 0 thì report đánh dấu is_fresh=false — cần refetch từ nguồn (REFRESH_SOURCE=1) với filter from-pub-date mới hơn.",
      run(ctx) {
        if (!ctx.publishedValid) {
          return { passed: false, explanation: "Không tính được age_days vì published không hợp lệ — freshness không xác định." };
        }
        const ageDays = daysBetween(ctx.publishedDate, ctx.receivedAt);
        if (ageDays < 0) {
          return {
            passed: false,
            explanation: `published nằm trong tương lai (${Math.abs(ageDays)} ngày sau thời điểm nhận) — dữ liệu bất thường, không tin freshness.`,
          };
        }
        const passed = ageDays <= RECORD_FRESHNESS_THRESHOLD_DAYS;
        return {
          passed,
          explanation: passed
            ? `age_days = ${ageDays} ngày (≤ ngưỡng ${RECORD_FRESHNESS_THRESHOLD_DAYS}) — dữ liệu còn mới (fresh).`
            : `age_days = ${ageDays} ngày (> ngưỡng ${RECORD_FRESHNESS_THRESHOLD_DAYS}) — stale, freshness report sẽ đánh dấu is_fresh=false.`,
        };
      },
    },
  ];

  function fillRecordForm(record) {
    document.getElementById("rf-paper-id").value = record.paper_id;
    document.getElementById("rf-title").value = record.title;
    document.getElementById("rf-summary").value = record.summary;
    document.getElementById("rf-published").value = record.published;
    document.getElementById("rf-row-count").value = record.row_count;
    document.getElementById("rf-dup-count").value = record.duplicate_count;
  }

  function readRecordContext() {
    const paperId = document.getElementById("rf-paper-id").value.trim();
    const title = document.getElementById("rf-title").value.trim();
    const summary = document.getElementById("rf-summary").value.trim();
    const publishedRaw = document.getElementById("rf-published").value.trim();
    const publishedDate = publishedRaw ? new Date(publishedRaw) : null;
    const publishedValid = !!publishedDate && !Number.isNaN(publishedDate.getTime());
    const rowCount = Number(document.getElementById("rf-row-count").value);
    const dupCount = Number(document.getElementById("rf-dup-count").value);
    return {
      paperId,
      title,
      summary,
      publishedRaw,
      publishedDate,
      publishedValid,
      rowCount: Number.isFinite(rowCount) ? rowCount : 0,
      dupCount: Number.isFinite(dupCount) ? dupCount : 1,
    };
  }

  function renderDimensionResult(slot, receivedAt, result) {
    slot.hidden = false;
    slot.innerHTML = "";

    const receivedLine = document.createElement("div");
    receivedLine.className = "received-at";
    receivedLine.innerHTML = "Nhận dữ liệu lúc: <strong></strong>";
    receivedLine.querySelector("strong").textContent = formatReceivedAt(receivedAt);
    slot.appendChild(receivedLine);

    const badgeRow = document.createElement("div");
    badgeRow.className = "record-summary-line";
    badgeRow.appendChild(statusBadge(result.passed, "PASS", "FAIL"));
    slot.appendChild(badgeRow);

    const explanation = document.createElement("p");
    explanation.className = "check-explanation";
    explanation.textContent = result.explanation;
    slot.appendChild(explanation);
  }

  function initDimensionChecker() {
    const grid = document.getElementById("dimension-grid");
    grid.innerHTML = "";

    DIMENSIONS.forEach((dim) => {
      const card = document.createElement("div");
      card.className = "dimension-card";

      const header = document.createElement("div");
      header.className = "dimension-card-header";
      const dot = document.createElement("span");
      dot.className = "dimension-dot";
      const h3 = document.createElement("h3");
      h3.textContent = dim.label;
      header.append(dot, h3);
      card.appendChild(header);

      const problemLabel = document.createElement("p");
      problemLabel.className = "dimension-desc-label";
      problemLabel.textContent = "Dạng lỗi thường gặp";
      const problemText = document.createElement("p");
      problemText.className = "dimension-desc-text";
      problemText.textContent = dim.problem;
      card.append(problemLabel, problemText);

      const remedyLabel = document.createElement("p");
      remedyLabel.className = "dimension-desc-label";
      remedyLabel.textContent = "Cách xử lý";
      const remedyText = document.createElement("p");
      remedyText.className = "dimension-desc-text";
      remedyText.textContent = dim.remedy;
      card.append(remedyLabel, remedyText);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary dimension-check-btn";
      btn.textContent = `Kiểm tra ${dim.label}`;
      card.appendChild(btn);

      const resultSlot = document.createElement("div");
      resultSlot.className = "dimension-result";
      resultSlot.hidden = true;
      card.appendChild(resultSlot);

      btn.addEventListener("click", () => {
        const receivedAt = new Date();
        const ctx = { ...readRecordContext(), receivedAt };
        const result = dim.run(ctx);
        renderDimensionResult(resultSlot, receivedAt, result);
      });

      grid.appendChild(card);
    });
  }

  function resetDimensionResults() {
    document.querySelectorAll(".dimension-result").forEach((slot) => {
      slot.hidden = true;
      slot.innerHTML = "";
    });
  }

  function initRecordChecker() {
    initDimensionChecker();
    document.getElementById("rf-fill-good").addEventListener("click", () => {
      fillRecordForm(SAMPLE_GOOD);
      resetDimensionResults();
    });
    document.getElementById("rf-fill-bad").addEventListener("click", () => {
      fillRecordForm(SAMPLE_BAD);
      resetDimensionResults();
    });
    document.getElementById("rf-clear").addEventListener("click", () => {
      fillRecordForm({ paper_id: "", title: "", summary: "", published: "", row_count: 24, duplicate_count: 1 });
      resetDimensionResults();
    });
  }

  (async function init() {
    initTheme();
    initRecordChecker();
    const data = await loadData();
    window.__dashboardData = data;
    renderAll(data);
  })();
})();
