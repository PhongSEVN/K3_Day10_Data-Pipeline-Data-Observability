(() => {
  "use strict";

  // ---------- theme (shared behavior with dashboard) ----------
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
    });
  }

  // ---------- scroll progress bar ----------
  function initProgress() {
    const fill = document.getElementById("progress-fill");
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  // ---------- reveal on scroll ----------
  function initReveal() {
    const steps = document.querySelectorAll("[data-step]");
    if (!("IntersectionObserver" in window)) {
      steps.forEach((s) => s.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    steps.forEach((step) => observer.observe(step));
  }

  // ---------- live data: corruption impact bars ----------
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }

  function renderMetricRow(container, label, baselineValue, corruptedValue) {
    const row = document.createElement("div");
    row.className = "story-metric-row";

    const name = document.createElement("span");
    name.className = "metric-name";
    name.textContent = label;

    const track = document.createElement("div");
    track.className = "story-metric-track";
    const baseFill = document.createElement("div");
    baseFill.className = "track-fill baseline";
    baseFill.style.width = `${Math.round(baselineValue * 100)}%`;
    baseFill.style.opacity = "0.35";
    const corruptFill = document.createElement("div");
    corruptFill.className = "track-fill corrupted";
    corruptFill.style.width = `${Math.round(corruptedValue * 100)}%`;
    track.append(baseFill, corruptFill);

    const value = document.createElement("span");
    value.className = "metric-value";
    value.textContent = `${baselineValue.toFixed(2)} → ${corruptedValue.toFixed(2)}`;

    row.append(name, track, value);
    container.appendChild(row);
  }

  async function loadImpactSection() {
    const target = document.getElementById("story-metric-bars");
    if (!target) return;
    try {
      const [baseline, corrupted] = await Promise.all([
        fetchJson("../data/results/baseline_metrics.json"),
        fetchJson("../data/results/corrupted_metrics.json"),
      ]);
      target.innerHTML = "";
      renderMetricRow(target, "retrieval_hit_rate", baseline.retrieval_hit_rate, corrupted.retrieval_hit_rate);
      renderMetricRow(target, "mean_token_f1", baseline.mean_token_f1, corrupted.mean_token_f1);
      renderMetricRow(target, "judge_accuracy", baseline.judge_accuracy, corrupted.judge_accuracy);
    } catch (err) {
      target.innerHTML =
        '<p class="story-note">Chưa fetch được số thật (đang mở file:// hoặc chưa chạy pipeline). Chạy <code>python -m http.server</code> ở thư mục gốc rồi mở lại qua http://localhost:8000/client/story.html.</p>';
    }
  }

  async function loadRepairSection() {
    const target = document.getElementById("story-repair-result");
    if (!target) return;
    try {
      const [baseline, corrupted, repaired] = await Promise.all([
        fetchJson("../data/results/baseline_metrics.json"),
        fetchJson("../data/results/corrupted_metrics.json"),
        fetchJson("../data/results/repaired_metrics.json"),
      ]);
      target.textContent =
        `retrieval_hit_rate: baseline ${baseline.retrieval_hit_rate.toFixed(2)} → corrupted ${corrupted.retrieval_hit_rate.toFixed(2)} → repaired ${repaired.retrieval_hit_rate.toFixed(2)}`;
    } catch (err) {
      target.textContent = "Chưa fetch được số thật — chạy pipeline rồi mở qua http server để xem kết quả repair thật.";
    }
  }

  (function init() {
    initTheme();
    initProgress();
    initReveal();
    loadImpactSection();
    loadRepairSection();
  })();
})();
