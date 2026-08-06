(() => {
  "use strict";

  // Mirrors src/ingestion/corruption.py 1:1 — same order, same row indices, same rules.
  const MIN_SUMMARY_CHARS = 20; // src/observability/quality.py
  const FRESHNESS_THRESHOLD_DAYS = 180; // src/core/config.py
  const NOISE_STR = " [CORRUPTED_NOISE_xyz123_invalid_garbled_data_stream] ";

  const MOCK_BATCH = [
    { paper_id: "10.1000/mock-a", title: "Agentic RAG for Scientific Literature Retrieval", summary: "We propose an agentic RAG pipeline combining semantic retrieval with tool-augmented reasoning for multi-hop questions.", authors_joined: "A. Nguyen", categories_joined: "cs.AI", published: "2026-06-01", age_days: 20 },
    { paper_id: "10.1000/mock-b", title: "Freshness Monitoring for Continuous Ingestion Pipelines", summary: "Automated freshness detection tracks publication age and staleness thresholds across academic data streams.", authors_joined: "B. Tran", categories_joined: "cs.DB", published: "2026-05-20", age_days: 32 },
    { paper_id: "10.1000/mock-c", title: "Vector Index Resilience Against Corrupted Metadata", summary: "We evaluate how truncated titles and blank summaries impact semantic retrieval and answer quality.", authors_joined: "C. Le", categories_joined: "cs.IR", published: "2026-05-15", age_days: 37 },
    { paper_id: "10.1000/mock-d", title: "Data Quality Assertions for Production RAG Systems", summary: "A study on completeness, uniqueness, and validity checks applied to vector database ingestion.", authors_joined: "D. Pham", categories_joined: "cs.SE", published: "2026-05-10", age_days: 42 },
    { paper_id: "10.1000/mock-e", title: "Deduplication Strategies for Noise-Resilient Vector Stores", summary: "Preventing duplicated records from dominating top-k search results in vector database collections.", authors_joined: "E. Vo", categories_joined: "cs.IR", published: "2026-04-28", age_days: 54 },
    { paper_id: "10.1000/mock-f", title: "LLM-as-Judge Protocols for Answer Quality Assessment", summary: "Using structured LLM outputs to grade answer correctness before and after data pipeline remediation.", authors_joined: "F. Bui", categories_joined: "cs.CL", published: "2026-04-20", age_days: 62 },
    { paper_id: "10.1000/mock-g", title: "Lineage Tracking for Scholarly Vector Observability", summary: "Tracking raw records from source ingestion to embedding manifests and evaluation report metrics.", authors_joined: "G. Do", categories_joined: "cs.DB", published: "2026-04-10", age_days: 72 },
    { paper_id: "10.1000/mock-h", title: "Impact of Stale Publication Dates on Retrieval Trust", summary: "Analyzing how outdated documents affect freshness signals and downstream agent trustworthiness.", authors_joined: "H. Ngo", categories_joined: "cs.IR", published: "2026-03-30", age_days: 83 },
  ];

  function normalizeWhitespace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function tokenF1(reference, prediction) {
    const refTokens = normalizeWhitespace(reference).toLowerCase().split(" ").filter(Boolean);
    const predTokens = normalizeWhitespace(prediction).toLowerCase().split(" ").filter(Boolean);
    if (!refTokens.length || !predTokens.length) return 0;
    const refSet = new Set(refTokens);
    const predSet = new Set(predTokens);
    const overlap = [...refSet].filter((t) => predSet.has(t)).length;
    if (overlap === 0) return 0;
    const precision = overlap / predSet.size;
    const recall = overlap / refSet.size;
    return (2 * precision * recall) / (precision + recall);
  }

  function textForEmbedding(row) {
    return `Title: ${row.title}\nAuthors: ${row.authors_joined}\nCategories: ${row.categories_joined}\nPublished: ${row.published}\nSummary: ${row.summary}`;
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }

  const BATCH_SIZE = 8;

  async function loadPool() {
    try {
      const clean = await fetchJson("../data/clean/papers_clean.json");
      if (Array.isArray(clean) && clean.length >= 2) {
        return { rows: clean.map((r) => ({ ...r })), isMock: false };
      }
      throw new Error("empty");
    } catch (err) {
      return { rows: MOCK_BATCH.map((r) => ({ ...r })), isMock: true };
    }
  }

  function shuffled(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pickRandomBatch(pool, size) {
    return shuffled(pool).slice(0, Math.min(size, pool.length));
  }

  async function loadTestSet() {
    try {
      const testSet = await fetchJson("../data/eval/test_set.json");
      return Array.isArray(testSet) ? testSet : [];
    } catch (err) {
      return [];
    }
  }

  // ---------- exact mirror of corrupt_clean_dataframe ----------
  function runCorruption(rows) {
    const log = { actions: [], original_row_count: rows.length };
    let working = rows.map((r) => ({ ...r }));

    if (working.length > 5) {
      const dropped = working.slice(0, 2);
      working = working.slice(2);
      log.actions.push({ type: "drop_latest_records", count: dropped.length, dropped_paper_ids: dropped.map((r) => r.paper_id) });
    }

    if (working.length >= 2) {
      [0, 1].forEach((idx) => {
        working[idx].summary = "";
        working[idx].summary_chars = 0;
        log.actions.push({ type: "blank_summary", paper_id: working[idx].paper_id, target_index: idx });
      });
    }

    if (working.length >= 4) {
      [2, 3].forEach((idx) => {
        const orig = working[idx].summary;
        working[idx].summary = `${NOISE_STR} ${orig.slice(0, 30)} ${NOISE_STR}`;
        working[idx].summary_chars = working[idx].summary.length;
        log.actions.push({ type: "inject_noise", paper_id: working[idx].paper_id, target_index: idx });
      });
    }

    if (working.length >= 6) {
      [4, 5].forEach((idx) => {
        const origTitle = working[idx].title;
        working[idx].title = origTitle.slice(0, 5);
        log.actions.push({ type: "truncate_title", paper_id: working[idx].paper_id, original_title: origTitle, truncated_title: working[idx].title });
      });
    }

    if (working.length >= 8) {
      [6, 7].forEach((idx) => {
        working[idx].published = "2020-01-01";
        working[idx].age_days = 2400;
        log.actions.push({ type: "stale_published_date", paper_id: working[idx].paper_id, new_published: "2020-01-01", new_age_days: 2400 });
      });
    }

    if (working.length >= 2) {
      const dup = working.slice(0, 2).map((r) => ({ ...r }));
      working = working.concat(dup);
      log.actions.push({ type: "add_duplicate_rows", count: dup.length, duplicated_paper_ids: dup.map((r) => r.paper_id) });
    }

    working = working.map((r) => ({ ...r, text_for_embedding: textForEmbedding(r) }));
    log.final_row_count = working.length;
    return { rows: working, log };
  }

  // ---------- quality checks, mirrors src/observability/quality.py ----------
  function runQualityChecks(rows) {
    const rowCount = rows.length;
    const checks = [];

    checks.push({ name: "row_count", dimension: "completeness", passed: rowCount > 0, detail: { row_count: rowCount } });

    const missingIds = rows.filter((r) => !r.paper_id).length;
    const counts = {};
    rows.forEach((r) => { counts[r.paper_id] = (counts[r.paper_id] || 0) + 1; });
    const duplicates = Object.values(counts).reduce((sum, c) => sum + Math.max(0, c - 1), 0);
    checks.push({ name: "paper_id_not_null_unique", dimension: "uniqueness", passed: missingIds === 0 && duplicates === 0, detail: { missing: missingIds, duplicates } });

    const titleMissing = rows.filter((r) => !r.title || !String(r.title).trim()).length;
    checks.push({ name: "title_not_null", dimension: "completeness", passed: titleMissing === 0, detail: { missing: titleMissing } });

    const tooShort = rows.filter((r) => String(r.summary || "").length < MIN_SUMMARY_CHARS).length;
    checks.push({ name: "summary_length", dimension: "validity", passed: tooShort === 0, detail: { below_min_chars: tooShort, min_chars: MIN_SUMMARY_CHARS } });

    const stale = rows.filter((r) => Number(r.age_days ?? 0) > FRESHNESS_THRESHOLD_DAYS).length;
    checks.push({ name: "freshness", dimension: "freshness", passed: stale === 0, detail: { stale_rows: stale, threshold_days: FRESHNESS_THRESHOLD_DAYS } });

    return { checks, passed: checks.every((c) => c.passed) };
  }

  function statusBadge(passed) {
    const badge = document.createElement("span");
    badge.className = `status-badge ${passed ? "pass" : "fail"}`;
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.style.background = passed ? "var(--status-good)" : "var(--status-critical)";
    const label = document.createElement("span");
    label.textContent = passed ? "PASS" : "FAIL";
    badge.append(dot, label);
    return badge;
  }

  function renderQuality(container, before, after) {
    container.innerHTML = "";
    [
      { label: "Trước corruption (baseline batch)", result: before },
      { label: "Sau corruption (6 bước)", result: after },
    ].forEach(({ label, result }) => {
      const card = document.createElement("div");
      card.className = "state-card";
      const header = document.createElement("div");
      header.className = "state-card-header";
      const h3 = document.createElement("h3");
      h3.textContent = label;
      header.appendChild(h3);
      header.appendChild(statusBadge(result.passed));
      card.appendChild(header);

      const list = document.createElement("ul");
      list.className = "check-list";
      result.checks.forEach((check) => {
        const li = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "check-dot";
        dot.style.background = check.passed ? "var(--status-good)" : "var(--status-critical)";
        const text = document.createElement("span");
        text.textContent = `${check.name} (${check.dimension}): ${check.passed ? "pass" : "fail"} — ${JSON.stringify(check.detail)}`;
        li.append(dot, text);
        list.appendChild(li);
      });
      card.appendChild(list);
      container.appendChild(card);
    });
  }

  function renderImpact(container, originalRows, corruptedRows, log, testSet) {
    container.innerHTML = "";

    const textActionTypes = new Set(["blank_summary", "inject_noise", "truncate_title", "stale_published_date"]);
    const affected = log.actions.filter((a) => textActionTypes.has(a.type) && a.paper_id);

    if (!affected.length) {
      container.innerHTML = '<p class="story-note">Batch quá nhỏ, không đủ record để kích hoạt các bước corruption theo text (cần ≥ 8 record).</p>';
    }

    affected.forEach((action) => {
      const originalRow = originalRows.find((r) => r.paper_id === action.paper_id);
      const corruptedRow = corruptedRows.find((r) => r.paper_id === action.paper_id);
      if (!originalRow || !corruptedRow) return;

      const questions = testSet.filter((q) => (q.ground_truth_doc_ids || []).includes(action.paper_id));
      const row = document.createElement("div");
      row.className = "impact-row";

      const title = document.createElement("div");
      title.className = "impact-title";
      title.innerHTML = `<code>${action.type}</code> — paper_id <code>${action.paper_id}</code>`;
      row.appendChild(title);

      if (!questions.length) {
        const note = document.createElement("p");
        note.className = "story-note";
        note.textContent = "Không có câu hỏi thật trong test_set.json tham chiếu record này để đo — vẫn hiện diff nội dung bên dưới.";
        row.appendChild(note);
      }

      questions.slice(0, 2).forEach((q) => {
        const before = tokenF1(q.ground_truth, textForEmbedding(originalRow));
        const after = tokenF1(q.ground_truth, textForEmbedding(corruptedRow));
        const line = document.createElement("div");
        line.className = "impact-score-line";
        const delta = after - before;
        line.innerHTML = `<span class="impact-q">"${q.question.slice(0, 70)}${q.question.length > 70 ? "…" : ""}"</span>
          <span class="impact-score">token_f1: ${before.toFixed(3)} → ${after.toFixed(3)} <strong class="${delta < 0 ? "impact-down" : "impact-flat"}">${delta < 0 ? "↓" : "="} ${delta.toFixed(3)}</strong></span>`;
        row.appendChild(line);
      });

      container.appendChild(row);
    });

    const dropAction = log.actions.find((a) => a.type === "drop_latest_records");
    if (dropAction) {
      const row = document.createElement("div");
      row.className = "impact-row";
      row.innerHTML = `<div class="impact-title"><code>drop_latest_records</code> — ${dropAction.dropped_paper_ids.length} record biến mất khỏi index</div>
        <p class="story-note">Nếu test set có câu hỏi ground-truth trỏ vào <code>${dropAction.dropped_paper_ids.join(", ")}</code>, câu đó sẽ hit_rate = 0 tuyệt đối — không tài liệu nào để tìm.</p>`;
      container.appendChild(row);
    }

    const dupAction = log.actions.find((a) => a.type === "add_duplicate_rows");
    if (dupAction) {
      const row = document.createElement("div");
      row.className = "impact-row";
      row.innerHTML = `<div class="impact-title"><code>add_duplicate_rows</code> — ${dupAction.duplicated_paper_ids.length} record bị nhân đôi trong index</div>
        <p class="story-note">paper_id <code>${dupAction.duplicated_paper_ids.join(", ")}</code> giờ chiếm 2 slot trong top-k thay vì 1 — làm giảm cơ hội tài liệu khác được retrieve, kể cả khi bản thân nó không đổi nội dung.</p>`;
      container.appendChild(row);
    }
  }

  async function init() {
    const runBtn = document.getElementById("lab-run");
    const resetBtn = document.getElementById("lab-reset");
    const statusEl = document.getElementById("lab-status");
    const qualityEl = document.getElementById("lab-quality");
    const impactEl = document.getElementById("lab-impact");
    if (!runBtn) return; // only present on story.html

    const [{ rows: pool, isMock }, testSet] = await Promise.all([loadPool(), loadTestSet()]);

    const readyText = () =>
      isMock
        ? `Sẵn sàng — pool ${pool.length} record mock (không fetch được data/clean/papers_clean.json thật, chạy qua http server để dùng data thật). Mỗi lần bấm "Chạy" sẽ chọn ngẫu nhiên ${BATCH_SIZE} record khác nhau.`
        : `Sẵn sàng — pool ${pool.length} record thật từ data/clean/papers_clean.json. Mỗi lần bấm "Chạy" sẽ chọn ngẫu nhiên ${BATCH_SIZE} record khác nhau.`;

    statusEl.textContent = readyText();

    function reset() {
      qualityEl.innerHTML = "";
      impactEl.innerHTML = "";
      statusEl.textContent = readyText();
    }

    runBtn.addEventListener("click", () => {
      const batch = pickRandomBatch(pool, BATCH_SIZE);
      const before = runQualityChecks(batch);
      const { rows: corrupted, log } = runCorruption(batch);
      const after = runQualityChecks(corrupted);

      statusEl.textContent = `Chạy xong (batch ngẫu nhiên mới): ${log.original_row_count} → ${log.final_row_count} record, ${log.actions.length} action áp dụng.`;
      renderQuality(qualityEl, before, after);
      renderImpact(impactEl, batch, corrupted, log, testSet);
    });

    resetBtn.addEventListener("click", reset);
  }

  init();
})();
